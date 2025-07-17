FROM alpine:latest

LABEL maintainer="RedOracle"

# 1. Install Bash, coreutils, xz, curl, etc.
RUN apk update && apk add --no-cache \
    bash \
    coreutils \
    curl \
    tar \
    sed \
    xz \
    gnupg \
    sudo \
    shadow \
    bash-completion

# 2. Create non-root user
RUN addgroup -g 1000 nixuser && \
    adduser -D -u 1000 -G nixuser -s /bin/bash nixuser && \
    echo "nixuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -m 0755 /nix && chown nixuser:nixuser /nix

# 3. Switch to nixuser
USER nixuser
WORKDIR /home/nixuser
ENV HOME=/home/nixuser USER=nixuser

# 4. Download installer and run with Bash explicitly
RUN sh <(curl -L https://nixos.org/nix/install) --no-daemon --yes

# 5. Configure nix.conf to disable sandbox
RUN mkdir -p /home/nixuser/.config/nix && \
    echo 'sandbox = false' > /home/nixuser/.config/nix/nix.conf

# 6. Initialize profile
RUN . /home/nixuser/.nix-profile/etc/profile.d/nix.sh && \
    nix-channel --update

ENV PATH=/home/nixuser/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:$PATH \
    NIX_PATH=/nix/var/nix/profiles/per-user/nixuser/channels

RUN echo ". /home/nixuser/.nix-profile/etc/profile.d/nix.sh" >> /home/nixuser/.bashrc

# Optional: check Nix version at build time
RUN nix-env --version

# Clean up apk caches
USER root
RUN rm -rf /var/cache/apk/*

USER nixuser
CMD ["bash"]
