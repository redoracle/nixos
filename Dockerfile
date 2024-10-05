# Dockerfile to create an environment that contains the Nix package manager.

FROM alpine:latest AS builder

LABEL maintainer="RedOracle"

# Update APK, enable HTTPS, and install necessary packages
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
    gnupg

# Copy the install_nix.sh script from the local directory to the container
COPY install_nix.sh /tmp/install_nix.sh

# Make sure the script is executable
RUN chmod +x /tmp/install_nix.sh

# Run the script to install Nix
RUN /tmp/install_nix.sh

RUN mkdir -m 0755 /etc/nix \
    && echo 'sandbox = false' > /etc/nix/nix.conf \
    && mkdir -m 0755 /nix && USER=root sh /nix/install

# Clean up builder image to keep it small
RUN rm -rf /var/cache/apk/*

####################
# Final Production #
####################

FROM alpine:latest

# Install necessary packages in the final image
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    bash \
    curl \
    sudo \
    openssl \
    grep \
    sed \
    gnupg

# Copy Nix installation from the builder stage
COPY --from=builder /nix /nix
COPY --from=builder /etc/nix /etc/nix

# Create Nix group and users in the final image
RUN addgroup -g 30000 -S nixbld && \
    for i in $(seq 1 30); do adduser -S -D -h /var/empty -g "Nix build user $i" -u $((30000 + i)) -G nixbld nixbld$i ; done

RUN mkdir -m 0755 /etc/nix \
    && echo 'sandbox = false' > /etc/nix/nix.conf \
    && mkdir -m 0755 /nix && USER=root sh $DIRE/install \
    && . /root/.nix-profile/etc/profile.d/nix.sh

# Set up environment variables for Nix
ENV \
    ENV=/etc/profile \
    USER=root \
    PATH=/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/root/channels

ONBUILD ENV \
    ENV=/etc/profile \
    USER=root \
    PATH=/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/root/channels


# Symlink Nix profiles
RUN ln -s /nix/var/nix/profiles/default/etc/profile.d/nix.sh /etc/profile.d/

# Clean up and optimize the Nix store
RUN /nix/var/nix/profiles/default/bin/nix-collect-garbage --delete-old && \
    /nix/var/nix/profiles/default/bin/nix-store --optimise && \
    /nix/var/nix/profiles/default/bin/nix-store --verify --check-contents \
    rm -rf /var/cache/apk/*

CMD ["/bin/bash"]
