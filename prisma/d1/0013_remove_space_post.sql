-- Removes the "share to room" feature's SpacePost table. Posting a shared
-- bsky.app link always 500'd (it builds the AT-URI from the handle instead
-- of resolving the DID first), so the feature is being pulled until it can
-- be redesigned and fixed (#66).
DROP TABLE "SpacePost";
