#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Function to display error messages
error_exit() {
    echo "Error: $1" >&2
    exit 1
}

# Define the base URL to fetch the Markdown content
BASE_URL="https://r.jina.ai/https://releases.nixos.org/?prefix=nix/"

# Fetch the Markdown content using curl
echo "Fetching release information from: $BASE_URL"
MD_CONTENT=$(curl -s "$BASE_URL") || error_exit "Failed to fetch the Markdown content."

# Extract version strings in the format nix-X.Y.Z/
# The regex looks for patterns like [nix-2.3.6/]
VERSIONS=$(echo "$MD_CONTENT" | grep -oP '\[nix-\d+\.\d+\.\d+/\]' | sed 's/\[nix-\(.*\)\/\]/\1/') || error_exit "Failed to extract versions."

# Check if any versions were found
if [ -z "$VERSIONS" ]; then
    error_exit "No versions found in the Markdown content."
fi

echo "Available versions found:"
echo "$VERSIONS"

# Sort the versions using version sort and get the latest one
LATEST_VERSION=$(echo "$VERSIONS" | sort -V | tail -n1) || error_exit "Failed to determine the latest version."

# Check if the latest version was successfully determined
if [ -z "$LATEST_VERSION" ]; then
    error_exit "Could not determine the latest version."
fi

echo "Latest version identified: $LATEST_VERSION"

# Construct the download URL for the latest Nix installer
DOWNLOAD_URL="https://releases.nixos.org/nix/nix-${LATEST_VERSION}/nix-${LATEST_VERSION}-i686-linux.tar.xz"

echo "Constructed download URL: $DOWNLOAD_URL"

# Optional: Verify that the download URL exists by checking the HTTP status code
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DOWNLOAD_URL")

if [ "$HTTP_STATUS" -ne 200 ]; then
    error_exit "Download URL not found (HTTP Status: $HTTP_STATUS)."
fi

# Download the latest Nix installer
echo "Downloading the latest Nix installer..."
curl -O "$DOWNLOAD_URL" || error_exit "Failed to download the installer."

echo "Download completed successfully: nix-${LATEST_VERSION}-i686-linux.tar.xz"
