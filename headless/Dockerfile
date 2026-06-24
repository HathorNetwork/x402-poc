# Payer wallet-headless + the @hathor/wallet-lib WebSocket socket-leak fix.
#
# OPT-IN: the default deploy uses the official image. To ship the fix, point the
# payer-wallet-headless service at this build (see docker-compose.yml + README.md).
#
# We extend the official image and patch the bundled (compiled) wallet-lib in
# place. The patch is FAIL-CLOSED: if the bundled wallet-lib no longer matches,
# the build fails instead of shipping an unpatched wallet.
#
# Must stay on :master — the dapp's x402 proof needs /wallet/sign-message, which
# only ships on the headless master branch.
FROM hathornetwork/hathor-wallet-headless:master

# Patching node_modules needs write access; the official image's default user may
# be non-root. Switch to root for the build step only.
USER root
WORKDIR /app

COPY patch-ws-leak.js /tmp/patch-ws-leak.js
RUN node /tmp/patch-ws-leak.js

# If the base image defines a non-root runtime user, restore it here to match the
# official image's posture, e.g.:
# USER node
