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
    gnupg

# Set error handling
ENV BASE_URL="https://r.jina.ai/https://releases.nixos.org/?prefix=nix/"

# Fetch the latest Nix version dynamically
RUN set -e && \
    echo "Fetching latest Nix version..." && \
    MD_CONTENT=$(curl -s "$BASE_URL") || (echo "Failed to fetch the Markdown content." && exit 1) && \
    VERSIONS=$(echo "$MD_CONTENT" | grep -E -o '\[nix-[0-9]+\.[0-9]+\.[0-9]+/\]' | sed 's/\[nix-\([0-9]\+\.[0-9]\+\.[0-9]\+\)\/\]/\1/') || \
    (echo "Failed to extract versions." && exit 1) && \
    if [ -z "$VERSIONS" ]; then \
        echo "No versions found in the Markdown content." && exit 1; \
    fi && \
    echo "Available versions found:" && \
    echo "$VERSIONS" && \
    LATEST_VERSION=$(echo "$VERSIONS" | sort -V | tail -n1) || \
    (echo "Failed to determine the latest version." && exit 1) && \
    if [ -z "$LATEST_VERSION" ]; then \
        echo "Could not determine the latest version." && exit 1; \
    fi && \
    echo "Latest version identified: $LATEST_VERSION" && \
    DOWNLOAD_URL="https://releases.nixos.org/nix/nix-${LATEST_VERSION}/nix-${LATEST_VERSION}-x86_64-linux.tar.xz" && \
    echo "Constructed download URL: $DOWNLOAD_URL" && \
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DOWNLOAD_URL") && \
    if [ "$HTTP_STATUS" -ne 200 ]; then \
        echo "Download URL not found (HTTP Status: $HTTP_STATUS)." && exit 1; \
    fi && \
    echo "Downloading the latest Nix installer..." && \
    curl -O "$DOWNLOAD_URL" || (echo "Failed to download the installer." && exit 1) && \
    echo "Download completed successfully: nix-${LATEST_VERSION}-x86_64-linux.tar.xz"

# Extract the downloaded file
RUN set -e && \
    tar xf nix-${LATEST_VERSION}-x86_64-linux.tar.xz

# Create Nix group and users
RUN addgroup -g 30000 -S nixbld && \
    for i in $(seq 1 30); do adduser -S -D -h /var/empty -g "Nix build user $i" -u $((30000 + i)) -G nixbld nixbld$i ; done

# Install Nix
RUN mkdir -m 0755 /etc/nix && \
    echo 'sandbox = false' > /etc/nix/nix.conf && \
    mkdir -m 0755 /nix && \
    ./nix-${LATEST_VERSION}-x86_64-linux/install

# Clean up builder image to keep it small
RUN rm -rf nix-${LATEST_VERSION}-x86_64-linux* && \
    rm -rf /var/cache/apk/*

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

# Set up environment variables for Nix
ENV \
    ENV=/etc/profile \
    USER=root \
    PATH=/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/root/channels

# Symlink Nix profiles
RUN ln -s /nix/var/nix/profiles/default/etc/profile.d/nix.sh /etc/profile.d/nix.sh

# Clean up and optimize the Nix store
RUN /nix/var/nix/profiles/default/bin/nix-collect-garbage --delete-old && \
    /nix/var/nix/profiles/default/bin/nix-store --optimise && \
    /nix/var/nix/profiles/default/bin/nix-store --verify --check-contents

CMD ["/bin/bash"]
