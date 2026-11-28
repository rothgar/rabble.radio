# Makefile for Rabble development.
#
# Targets are grouped into local development and verification.

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
