# Alpine + Nix → NixOS

![GitHub Repo Stars](https://img.shields.io/github/stars/redoracle/nixos.svg?style=social&label=Star)
![GitHub Forks](https://img.shields.io/github/forks/redoracle/nixos.svg?style=social&label=Fork)
![GitHub Issues](https://img.shields.io/github/issues/redoracle/nixos.svg)
![GitHub License](https://img.shields.io/github/license/redoracle/nixos.svg)
![Docker Image Size](https://img.shields.io/docker/image-size/ghcr.io/redoracle/nixos/latest)
![Build Status](https://github.com/redoracle/nixos/actions/workflows/docker-image.yml/badge.svg)

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Using Docker](#using-docker)
  - [Manual Installation](#manual-installation)
- [Usage](#usage)
- [Build and Deployment](#build-and-deployment)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Introduction

Welcome to the **Alpine + Nix → NixOS** project! This repository provides a streamlined environment that combines the lightweight and security-focused nature of Alpine Linux with the powerful and reproducible package management capabilities of Nix. The result is a flexible and efficient system reminiscent of NixOS, tailored for both development and production environments.

## Features

- **Lightweight Base**: Utilizes Alpine Linux, known for its minimal footprint and security-oriented design.
- **Reproducible Package Management**: Leverages Nix for reliable and reproducible builds, atomic upgrades, and rollbacks.
- **Multi-Architecture Support**: Built to support multiple architectures, including `amd64` and `arm64`.
- **Automated CI/CD**: Integrated GitHub Actions for continuous integration and deployment to GitHub Container Registry (GHCR) and Docker Hub.
- **Secure Environment**: All binaries are compiled with security features such as Position Independent Executables (PIE) and stack smashing protection.

## Prerequisites

Before you begin, ensure you have met the following requirements:

- **Docker**: Install Docker to build and run the containerized environment.
  - [Docker Installation Guide](https://docs.docker.com/get-docker/)
- **GitHub Account**: Required for accessing the repository and configuring GitHub Actions.
- **Docker Hub Account**: Optional, for deploying images to Docker Hub.

## Installation

### Using Docker

1. **Clone the Repository**

   ```bash
   git clone https://github.com/redoracle/nixos.git
   cd nixos
   ```

2. **Build the Docker Image**

   ```bash
   docker build -t ghcr.io/redoracle/nixos:latest .
   ```

3. **Run the Docker Container**

   ```bash
   docker run -it ghcr.io/redoracle/nixos:latest /bin/bash
   ```

### Manual Installation

If you prefer to install Nix manually on Alpine Linux:

1. **Ensure Dependencies are Installed**

   ```bash
   apk update && apk upgrade
   apk add --no-cache bash curl sudo openssl grep sed xz gnupg
   ```

2. **Download and Run the Installation Script**

   ```bash
   curl -O https://raw.githubusercontent.com/redoracle/nixos/refs/heads/master/install_nix.sh
   chmod +x install_nix.sh
   ./install_nix.sh
   ```

## Usage

Once installed, you can use Nix to manage packages within your Alpine Linux environment. Some common Nix commands include:

- **Install a Package**

  ```bash
  nix-env -iA nixpkgs.package-name
  ```

- **Upgrade Packages**

  ```bash
  nix-env -u
  ```

- **Rollback to Previous Configuration**

  ```bash
  nix-env --rollback
  ```

For more detailed usage, refer to the [Nix Manual](https://nixos.org/manual/nix/stable/).

## Build and Deployment

This project utilizes GitHub Actions to automate the build and deployment process. The workflow is triggered on pushes to the `main` or `master` branches, on manual dispatch, and is scheduled to run every Sunday.

### GitHub Actions Workflow

The workflow performs the following steps:

1. **Checkout Repository**: Retrieves the latest code from the repository.
2. **Set Up Docker Buildx**: Prepares the Docker builder for multi-platform builds.
3. **Authenticate with Registries**: Logs into GitHub Container Registry (GHCR) and Docker Hub.
4. **Get Nix Version**: Extracts the installed Nix version for tagging the image and releases.
5. **Build and Push Docker Image**: Builds the Docker image and pushes it to both GHCR and Docker Hub.
6. **Create Release**: Automatically creates a new GitHub release if the version does not exist.
7. **Cleanup**: Prunes unused Docker builder cache to optimize runner resources.

### Workflow Configuration

The GitHub Actions workflow is defined in `.github/workflows/docker-deploy.yml`. Ensure you have set the following secrets in your GitHub repository:

- `DOCKER_USERNAME`: Your Docker Hub username.
- `DOCKER_PASSWORD`: Your Docker Hub password or access token.

### Example Workflow File

```yaml
name: Build and Deploy NixOS Docker Image

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # Every Sunday at midnight UTC
  push:
    branches:
      - master
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      # Checkout the repository
      - name: Checkout repository
        uses: actions/checkout@v4

      # Set up Docker Buildx
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Log in to GitHub Container Registry (GHCR)
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Log in to Docker Hub
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      # Get Nix version from the Dockerfile
      - name: Get Nix version
        id: get_version
        run: |
          NIX_VERSION=$(docker run --rm $(docker build -q .) nix-env --version | cut -d ' ' -f 3)
          echo "NIX_VERSION=$NIX_VERSION" >> $GITHUB_ENV

      # Build and Push Docker Image
      - name: Build and Push Docker Image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          platforms: linux/amd64,linux/arm64
          tags: |
            ghcr.io/${{ github.repository_owner }}/nixos:${{ env.NIX_VERSION }}
            ghcr.io/${{ github.repository_owner }}/nixos:latest
            ${{ secrets.DOCKER_USERNAME }}/nixos:${{ env.NIX_VERSION }}
            ${{ secrets.DOCKER_USERNAME }}/nixos:latest

      # Create GitHub release if it does not exist
      - name: Create GitHub release
        if: env.create_release == 'true'
        uses: actions/create-release@v1
        with:
          tag_name: v${{ env.NIX_VERSION }}
          release_name: NixOS Docker Image v${{ env.NIX_VERSION }}
          draft: false
          prerelease: false
          body: |
            NixOS Docker image version ${{ env.NIX_VERSION }} has been built and released.
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Post-build cleanup (optional)
      - name: Docker prune
        run: docker builder prune --force
```

## Contributing

Contributions are welcome! To contribute:

1. **Fork the Repository**

2. **Create a Feature Branch**

   ```bash
   git checkout -b feature/YourFeature
   ```

3. **Commit Your Changes**

   ```bash
   git commit -m "Add some feature"
   ```

4. **Push to the Branch**

   ```bash
   git push origin feature/YourFeature
   ```

5. **Open a Pull Request**

Please ensure your contributions adhere to the following guidelines:

- Follow the existing coding style.
- Write clear and concise commit messages.
- Include relevant documentation and tests.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact

For any questions or support, please open an [issue](https://github.com/redoracle/nixos/issues) or contact [your-email@example.com](mailto:your-email@example.com).

---

![Your Repository Stats](https://github-readme-stats.vercel.app/api?username=redoracle&show_icons=true&theme=radical)
![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=redoracle&layout=compact&theme=radical)
```

### What has been added:

1. **Nix

 Version Retrieval:**
   - Added a new workflow step that fetches the Nix version from the Docker build and uses it for tagging the Docker image and creating GitHub releases.

2. **Image Publishing:**
   - Updated the Docker build and push step to push images to both Docker Hub and GHCR with versioned and `latest` tags.

3. **GitHub Release Creation:**
   - Added a step to create a new GitHub release if a release with the Nix version tag doesn’t already exist.

4. **Scheduled Build:**
   - The workflow now runs automatically every Sunday at midnight UTC.
