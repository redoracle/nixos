# Dockerfile to create an environment that contains the Nix package manager.

FROM alpine
MAINTAINER RedOracle

########################
# One layer execution: #
########################
# Enable HTTPS support in wget.
# Adding edge repo
# fix CVE-2019-5021
# Getting the latest NX version
# Download Nix and install it into the system.

# One layer execution:
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \ 
  && sed -i -e 's/^root::/root:!:/' /etc/shadow \ 
  && apk update \
  && apk upgrade \
  && apk add --update openssl curl bash sudo \ 
  && GETTER=$(curl https://nixos.org/releases/nix/latest/ -o index.html) \ 
  && DFILE=$(cat index.html | grep x86_64-linux.tar.xz | cut -d "\"" -f 8 | head -1) \
  && wget https://nixos.org/releases/nix/latest/$DFILE \
  && DIRE=$(echo $DFILE | rev | cut -f 2- -d '.' | rev | rev | cut -f 2- -d '.' | rev) \
  && tar xf $DFILE \
  && addgroup -g 30000 -S nixbld \
  && for i in $(seq 1 30); do adduser -S -D -h /var/empty -g "Nix build user $i" -u $((30000 + i)) -G nixbld nixbld$i ; done \
  && mkdir -m 0755 /etc/nix \
  && echo 'sandbox = false' > /etc/nix/nix.conf \
  && mkdir -m 0755 /nix && USER=root sh $DIRE/install \
  && . /root/.nix-profile/etc/profile.d/nix.sh \
  && ln -s /nix/var/nix/profiles/default/etc/profile.d/nix.sh /etc/profile.d/ \
  && rm -r /$DIRE* \
  && rm -rf /var/cache/apk/* \
  && /nix/var/nix/profiles/default/bin/nix-collect-garbage --delete-old \
  && /nix/var/nix/profiles/default/bin/nix-store --optimise \
  && /nix/var/nix/profiles/default/bin/nix-store --verify --check-contents

ONBUILD ENV \
    ENV=/etc/profile \
    USER=root \
    PATH=/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/root/channels

ENV \
    ENV=/etc/profile \
    USER=root \
    PATH=/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/bin:/sbin:/usr/bin:/usr/sbin \
    NIX_PATH=/nix/var/nix/profiles/per-user/root/channels
