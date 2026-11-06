# syntax=docker/dockerfile:1
# Pin the Alpine release series; apk resolves security updates in its repositories.
FROM alpine:3.24.4

LABEL org.opencontainers.image.title="Alpine + Nix" \
      org.opencontainers.image.description="Alpine Linux with the distro-packaged Nix package manager" \
      org.opencontainers.image.source="https://github.com/redoracle/nixos" \
      org.opencontainers.image.licenses="MIT"

# Use Alpine's signed packages rather than running a remote installation script.
RUN apk add --no-cache bash ca-certificates nix \
    && addgroup -S -g 10001 nixuser \
    && adduser -S -D -u 10001 -G nixuser -h /home/nixuser -s /bin/bash nixuser \
    && mkdir -p /nix /home/nixuser/.config/nix \
    && printf '%s\n' \
       '# Containers normally lack the user namespaces required for Nix builds.' \
       'sandbox = false' \
       'build-users-group =' \
       'experimental-features = nix-command flakes' \
       > /home/nixuser/.config/nix/nix.conf \
    && chown -R nixuser:nixuser /nix /home/nixuser

ENV HOME=/home/nixuser \
    USER=nixuser \
    PATH=/home/nixuser/.nix-profile/bin:$PATH
USER nixuser
WORKDIR /home/nixuser

# Initialize the single-user store and fail the build if Nix is unusable.
RUN nix-store --init \
    && nix --version \
    && test "$(nix-instantiate --eval --expr '1 + 1')" = 2

CMD ["bash"]
