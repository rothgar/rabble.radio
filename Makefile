# Makefile for Rabble development, build, and deployment.
#
# Targets are grouped into local development, verification, container
# operations, remote deployment, and one-shot push workflows.

REMOTE_HOST ?= rabble.exe.xyz
REMOTE_DIR  ?= /home/exedev/rabble
IMAGE_NAME  ?= rabble:local
SSH         ?= ssh -i ~/.ssh/id_rsa

RSYNC_EXCLUDES := --exclude node_modules --exclude .next --exclude .git --exclude secrets/private-key.pem

.PHONY: help
help: ## Show this help message
	@echo "Rabble Makefile"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------

.PHONY: install
install: ## Install dependencies with pnpm
	pnpm install

.PHONY: dev
dev: ## Start the local Next.js development server
	pnpm dev

.PHONY: prisma-generate
prisma-generate: ## Generate the Prisma client
	pnpm prisma generate

.PHONY: prisma-migrate-dev
prisma-migrate-dev: ## Create a new Prisma migration for local development
	pnpm prisma migrate dev

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

.PHONY: typecheck
typecheck: ## Run TypeScript type checking
	pnpm typecheck

.PHONY: test
test: ## Run the full test suite
	pnpm test

.PHONY: lint
lint: ## Run ESLint
	pnpm lint

.PHONY: check
check: typecheck test ## Run typecheck and tests

# ---------------------------------------------------------------------------
# Local container
# ---------------------------------------------------------------------------

.PHONY: build
build: ## Build the local Docker image
	docker build -t $(IMAGE_NAME) .

.PHONY: build-and-verify
build-and-verify: build build-verify ## Build the local Docker image and verify it

.PHONY: build-verify
build-verify: ## Verify $(IMAGE_NAME) has a working Prisma standalone runtime
	docker run --rm -v "$(CURDIR)/scripts:/app/scripts:ro" $(IMAGE_NAME) node /app/scripts/verify-prisma-standalone.mjs

.PHONY: remote-build-verify
remote-build-verify: ## Verify $(IMAGE_NAME) on the remote host has a working Prisma standalone runtime
	$(SSH) $(REMOTE_HOST) 'docker run --rm -v $(REMOTE_DIR)/scripts:/app/scripts:ro $(IMAGE_NAME) node /app/scripts/verify-prisma-standalone.mjs'

.PHONY: compose-up
compose-up: ## Start Postgres, LiveKit, migrate, and the app locally with Docker Compose
	docker compose up -d

.PHONY: compose-down
compose-down: ## Stop the local Docker Compose stack
	docker compose down

.PHONY: compose-logs
compose-logs: ## Tail logs from the local Docker Compose stack
	docker compose logs -f

# ---------------------------------------------------------------------------
# Remote deployment
# ---------------------------------------------------------------------------

.PHONY: sync
sync: ## Sync source, tests, and Prisma files to the remote host
	rsync -avz --delete -e "$(SSH)" $(RSYNC_EXCLUDES) src/ $(REMOTE_HOST):$(REMOTE_DIR)/src/
	rsync -avz --delete -e "$(SSH)" $(RSYNC_EXCLUDES) tests/ $(REMOTE_HOST):$(REMOTE_DIR)/tests/
	rsync -avz --delete -e "$(SSH)" $(RSYNC_EXCLUDES) prisma/ $(REMOTE_HOST):$(REMOTE_DIR)/prisma/
	rsync -avz --delete -e "$(SSH)" $(RSYNC_EXCLUDES) public/ $(REMOTE_HOST):$(REMOTE_DIR)/public/
	rsync -avz --delete -e "$(SSH)" $(RSYNC_EXCLUDES) scripts/ $(REMOTE_HOST):$(REMOTE_DIR)/scripts/
	rsync -avz --delete docker-compose.yml $(REMOTE_HOST):$(REMOTE_DIR)/docker-compose.yml
	rsync -avz --delete Dockerfile $(REMOTE_HOST):$(REMOTE_DIR)/Dockerfile
	rsync -avz --delete .dockerignore $(REMOTE_HOST):$(REMOTE_DIR)/.dockerignore
	rsync -avz --delete tsconfig.json $(REMOTE_HOST):$(REMOTE_DIR)/tsconfig.json
	rsync -avz --delete tailwind.config.js $(REMOTE_HOST):$(REMOTE_DIR)/tailwind.config.js
	rsync -avz --delete postcss.config.js $(REMOTE_HOST):$(REMOTE_DIR)/postcss.config.js
	rsync -avz --delete next.config.js $(REMOTE_HOST):$(REMOTE_DIR)/next.config.js
	rsync -avz --delete next-env.d.ts $(REMOTE_HOST):$(REMOTE_DIR)/next-env.d.ts
	rsync -avz --delete vitest.config.ts $(REMOTE_HOST):$(REMOTE_DIR)/vitest.config.ts
	rsync -avz --delete livekit-egress.yaml $(REMOTE_HOST):$(REMOTE_DIR)/livekit-egress.yaml
	rsync -avz --delete .env.example $(REMOTE_HOST):$(REMOTE_DIR)/.env.example
	rsync -avz --delete package.json $(REMOTE_HOST):$(REMOTE_DIR)/package.json
	rsync -avz --delete pnpm-lock.yaml $(REMOTE_HOST):$(REMOTE_DIR)/pnpm-lock.yaml

.PHONY: remote-migrate
remote-migrate: ## Run Prisma migrations on the remote host
	$(SSH) $(REMOTE_HOST) 'cd $(REMOTE_DIR) && docker compose run --rm migrate npx prisma migrate deploy'

.PHONY: remote-build
remote-build: ## Build the Docker image on the remote host
	$(SSH) $(REMOTE_HOST) 'cd $(REMOTE_DIR) && docker build -t $(IMAGE_NAME) .'

.PHONY: remote-build-and-verify
remote-build-and-verify: remote-build remote-build-verify ## Build the Docker image on the remote host and verify it

.PHONY: remote-deploy
remote-deploy: ## Restart the Docker Compose stack on the remote host
	$(SSH) $(REMOTE_HOST) 'cd $(REMOTE_DIR) && export JWKS_PRIVATE_KEY="$$(cat secrets/private-key.pem)" && docker compose up -d'

.PHONY: remote-logs
remote-logs: ## Tail app logs on the remote host
	$(SSH) $(REMOTE_HOST) 'cd $(REMOTE_DIR) && docker compose logs -f app'

.PHONY: remote-health
remote-health: ## Check the remote /api/health endpoint
	curl -s https://$(REMOTE_HOST)/api/health | jq .

# ---------------------------------------------------------------------------
# One-shot workflows
# ---------------------------------------------------------------------------

.PHONY: push
push: check sync remote-migrate remote-build remote-deploy remote-health ## Full push: verify locally, sync, migrate, build, deploy, and health-check

.PHONY: quick-push
quick-push: sync remote-build remote-deploy remote-health ## Sync, build, deploy, and health-check (no local verification or migration)

.PHONY: deploy
deploy: sync remote-build remote-deploy remote-health ## Alias for quick-push
