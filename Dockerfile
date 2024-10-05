# Dockerfile to create an environment that contains the Nix package manager as a non-root user.

FROM alpine:latest

LABEL maintainer="RedOracle"

# Install necessary packages including 'shadow' for user management
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        bash \
        curl \
        tar \
        sudo \
        openssl \
        grep \
        sed \
        xz \
        gnupg \
        shadow \
        bash-completion

# Create a non-root user 'nixuser' with UID and GID 1000
RUN addgroup -g 1000 nixuser && \
    adduser -D -u 1000 -G nixuser -s /bin/bash nixuser

# Grant 'nixuser' passwordless sudo privileges
RUN echo "nixuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create the /nix directory as root and set ownership to nixuser
RUN mkdir -m 0755 /nix && chown nixuser:nixuser /nix

# Set the working directory to the home of nixuser
WORKDIR /home/nixuser

# Switch to the non-root user
USER nixuser

# Install Nix in single-user mode
RUN sh <(curl -L https://nixos.org/nix/install) --no-daemon --yes

# Configure Nix for nixuser
RUN mkdir -p -m 0755 /home/nixuser/.config/nix && \
    echo 'sandbox = false' > /home/nixuser/.config/nix/nix.conf

# Set environment variables for Nix
ENV USER=nixuser \
    HOME=/home/nixuser \
    PATH=/home/nixuser/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/nixuser/channels

# Source the Nix profile in the shell
RUN echo ". /home/nixuser/.nix-profile/etc/profile.d/nix.sh" >> /home/nixuser/.bashrc

# Check the Nix version and export it as an environment variable
RUN NIX_VERSION=$(nix-env --version | cut -d ' ' -f 3) && \
    echo "NIX_VERSION=${NIX_VERSION}" >> /home/nixuser/.bashrc && \
    export NIX_VERSION
    
# Clean up APK cache to reduce image size
USER root
RUN rm -rf /var/cache/apk/*

# Switch back to nixuser
USER nixuser

# Set the default command to bash
CMD ["/bin/bash"]
