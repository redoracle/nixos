# Alpine + Nix → NixOS

![GitHub Repo Stars](https://img.shields.io/github/stars/redoracle/nixos.svg?style=social&label=Star)
![GitHub Forks](https://img.shields.io/github/forks/redoracle/nixos.svg?style=social&label=Fork)
![GitHub Issues](https://img.shields.io/github/issues/redoracle/nixos.svg)
![GitHub License](https://img.shields.io/github/license/redoracle/nixos.svg)
![Docker Image Size](https://img.shields.io/docker/image-size/ghcr.io/redoracle/nixos/latest)
![Docker Pulls](https://img.shields.io/docker/pulls/ghcr.io/redoracle/nixos.svg)
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

This project utilizes GitHub Actions to automate the build and deployment process. The workflow is triggered on pushes to the `main` branch or via manual dispatch.

### GitHub Actions Workflow

The workflow performs the following steps:

1. **Checkout Repository**: Retrieves the latest code from the repository.
2. **Set Up Docker Buildx**: Prepares the Docker builder for multi-platform builds.
3. **Authenticate with Registries**: Logs into GitHub Container Registry (GHCR) and Docker Hub.
4. **Build and Push Docker Image**: Builds the Docker image and pushes it to both GHCR and Docker Hub.
5. **Cleanup**: Prunes unused Docker builder cache to optimize runner resources.

### Workflow Configuration

The GitHub Actions workflow is defined in `.github/workflows/docker-deploy.yml`. Ensure you have set the following secrets in your GitHub repository:

- `DOCKER_USERNAME`: Your Docker Hub username.
- `DOCKER_PASSWORD`: Your Docker Hub password or access token.

### Example Workflow File

```yaml
name: Build and Deploy NixOS Docker Image

on:
  workflow_dispatch:
  push:
    branches:
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

      # Build and Push Docker Image
      - name: Build and Push Docker Image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          platforms: linux/amd64,linux/arm64
          tags: |
            ghcr.io/${{ github.repository_owner }}/nixos:latest
            ${{ secrets.DOCKER_USERNAME }}/nixos:latest

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

---

## Explanation of Improvements

### 1. **Title and Badges**

- **Title**: Changed to `Alpine + Nix → NixOS` for clarity.
- **Badges**: Added various badges to display repository stats, Docker image status, and build status. Replace `redoracle` and `nixos` with your actual GitHub username and repository name.

### 2. **Table of Contents**

- **Purpose**: Helps users navigate the README easily, especially as it grows in complexity.

### 3. **Introduction**

- **Content**: Provides a clear and concise overview of what the project is about, its purpose, and the technologies involved.

### 4. **Features**

- **Detailed Features**: Highlights the key features and advantages of using this project, making it easier for users to understand its benefits.

### 5. **Prerequisites**

- **Dependencies**: Lists necessary tools and accounts required to use or contribute to the project, ensuring users are prepared before installation.

### 6. **Installation**

- **Using Docker**: Provides step-by-step instructions to build and run the Docker image.
- **Manual Installation**: Offers an alternative method for those who prefer not to use Docker, enhancing accessibility.

### 7. **Usage**

- **Common Commands**: Lists essential Nix commands to help users get started quickly.
- **Documentation Link**: Directs users to the official Nix manual for more detailed information.

### 8. **Build and Deployment**

- **GitHub Actions Workflow**: Explains the CI/CD process, detailing each step of the workflow.
- **Secrets Configuration**: Informs users about necessary GitHub secrets for the workflow to function correctly.
- **Example Workflow File**: Provides a complete example of the GitHub Actions configuration for easy setup.

### 9. **Contributing**

- **Contribution Guidelines**: Encourages contributions and provides clear instructions on how to contribute, fostering community engagement.
- **Best Practices**: Suggests maintaining code quality and documentation standards.

### 10. **License**

- **License Information**: Clearly states the project's license, ensuring legal clarity for users and contributors.

### 11. **Contact**

- **Support Channels**: Offers ways for users to seek help or provide feedback, enhancing user support.

### 12. **GitHub Stats**

- **Repository Stats**: Adds GitHub Readme Stats badges to showcase repository metrics like stars, forks, and top languages, providing social proof and insights into the project's popularity.

### 13. **Overall Formatting and Clarity**

- **Markdown Formatting**: Utilizes proper markdown syntax for headers, lists, code blocks, and links to ensure readability.
- **Clear Instructions**: Provides precise and actionable steps, reducing the likelihood of user errors during setup or usage.
- **Professional Tone**: Maintains a professional and informative tone throughout, suitable for a GitHub repository.

### 14. **Customization Placeholders**

- **Placeholders**: Uses placeholders like `redoracle` and `nixos` which should be replaced with actual values, ensuring users can easily adapt the README to their specific repository.

---

## Final Notes

- **Replace Placeholders**: Ensure you replace all instances of `redoracle`, `nixos`, and `your-email@example.com` with your actual GitHub username, repository name, and contact email.
- **Add License File**: Make sure to include a `LICENSE` file in your repository that matches the license mentioned in the README.
- **Enhance Badges**: You can add more badges as needed, such as coverage reports or additional CI statuses.
- **Update GitHub Stats URLs**: The GitHub stats badges at the bottom use [GitHub Readme Stats](https://github.com/anuraghazra/github-readme-stats). Ensure you configure them as per your preferences.