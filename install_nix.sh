#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Trap for cleanup on exit
trap cleanup EXIT

# Function to display error messages
error_exit() {
    echo "Error: $1" >&2
    exit 1
}

# Function to cleanup temporary files if needed
cleanup() {
    # Add cleanup logic here if necessary (e.g., removing temp files)
    echo "Cleaning up..."
}

# Define the base URL to fetch the Markdown content
BASE_URL="https://r.jina.ai/https://releases.nixos.org/?prefix=nix/"

# Fetch the Markdown content using curl with retries
echo "Fetching release information from: $BASE_URL"
MD_CONTENT=$(curl -s --retry 5 --retry-delay 5 "$BASE_URL") || error_exit "Failed to fetch the Markdown content."

# Extract version strings in the format nix-X.Y.Z/
# The regex looks for patterns like [nix-2.3.6/]
VERSIONS=$(echo "$MD_CONTENT" | grep -oE '\[nix-\d+\.\d+\.\d+/\]' | sed 's/\[nix-\(.*\)\/\]/\1/') || error_exit "Failed to extract versions."

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
DOWNLOAD_URL="https://releases.nixos.org/nix/nix-${LATEST_VERSION}/nix-${LATEST_VERSION}-x86_64-linux.tar.xz"

echo "Constructed download URL: $DOWNLOAD_URL"

# Verify that the download URL exists by checking the HTTP status code
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DOWNLOAD_URL")

if [ "$HTTP_STATUS" -ne 200 ]; then
    error_exit "Download URL not found (HTTP Status: $HTTP_STATUS)."
fi

# Download the latest Nix installer with progress display
echo "Downloading the latest Nix installer..."
curl -O --progress-bar "$DOWNLOAD_URL" || error_exit "Failed to download the installer."

echo "Download completed successfully: nix-${LATEST_VERSION}-x86_64-linux.tar.xz"

# Decompress the tar.xz file
echo "Decompressing: nix-${LATEST_VERSION}-x86_64-linux.tar.xz"
xz -d -v "nix-${LATEST_VERSION}-x86_64-linux.tar.xz" || error_exit "Failed to decompress the tar.xz file."

# Extract the tar file
echo "Extracting: nix-${LATEST_VERSION}-x86_64-linux.tar"
tar xvf "nix-${LATEST_VERSION}-x86_64-linux.tar" || error_exit "Failed to extract the tar file."

echo "Extraction completed successfully."
