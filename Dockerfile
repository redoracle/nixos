FROM alpine:latest

# Install dependencies
RUN apk update && apk add --no-cache \
    bash coreutils curl tar sed xz gnupg sudo shadow bash-completion

# Add non-root user 'nixuser'
RUN addgroup -g 1000 nixuser && \
    adduser -D -u 1000 -G nixuser -s /bin/bash nixuser && \
    echo "nixuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -m 0755 /nix && chown nixuser:nixuser /nix

USER nixuser
WORKDIR /home/nixuser
ENV HOME=/home/nixuser USER=nixuser

# Pre-configure nix to disable sandbox and seccomp
RUN mkdir -p ~/.config/nix && \
    echo 'sandbox = false' >> ~/.config/nix/nix.conf && \
    echo 'filter-syscalls = false' >> ~/.config/nix/nix.conf

# Run installer explicitly with bash
RUN curl -L https://nixos.org/nix/install | bash -s -- --no-daemon

# Initialize Nix environment
RUN . /home/nixuser/.nix-profile/etc/profile.d/nix.sh && \
    nix-channel --update

# Add nix to path
ENV PATH=/home/nixuser/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:$PATH \
    NIX_PATH=/nix/var/nix/profiles/per-user/nixuser/channels

# Add nix initialization to shell profile
RUN echo ". /home/nixuser/.nix-profile/etc/profile.d/nix.sh" >> ~/.bashrc

# Confirm Nix installation
RUN nix-env --version

USER root
RUN rm -rf /var/cache/apk/*

USER nixuser
CMD ["bash"]