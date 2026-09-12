{
  description = "renCal - A modern open-source calendar app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default;

        # Caldir provider binaries
        caldirVersion = "v0.13.1";
        caldirProviders = {
          x86_64-linux = pkgs.fetchurl {
            url = "https://github.com/t4t5/caldir/releases/download/${caldirVersion}/caldir-x86_64-unknown-linux-musl.tar.gz";
            hash = "sha256-mZD+rTN+WBzhptsK9B+9BDbJqGcogIZOTr54RSVLTFc=";
          };
          aarch64-linux = pkgs.fetchurl {
            url = "https://github.com/t4t5/caldir/releases/download/${caldirVersion}/caldir-aarch64-unknown-linux-musl.tar.gz";
            hash = "sha256-DCEnkXUfBTzjLv3R8jKkhVJGAkcAHhzHoT/GE0FGURQ=";
          };
        };

        rencal = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "rencal";
          version = "0.7.0";

          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let
                baseName = builtins.baseNameOf path;
              in
              !(baseName == "target" ||
                baseName == "node_modules" ||
                baseName == "dist" ||
                baseName == ".git" ||
                baseName == "result" ||
                builtins.match ".*\\.log$" baseName != null);
          };

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            hash = "sha256-PnPY/3LDeB3/J2JgT/NfIMwpcaxHrFfHqALwa68vplA=";
            fetcherVersion = 4;
          };

          cargoRoot = "src-tauri";

          cargoDeps = pkgs.rustPlatform.importCargoLock {
            lockFile = ./src-tauri/Cargo.lock;
            outputHashes = {
              "caldir-core-0.14.3" = "sha256-gE8sTZz93augAInEj47M/e21bphrW+PO27lBFxYNgGE=";
            };
          };

          nativeBuildInputs = with pkgs; [
            rustToolchain
            cargo-tauri
            nodejs_22
            pnpm
            pnpmConfigHook
            pkg-config
            wrapGAppsHook3
            makeWrapper
            rustPlatform.cargoSetupHook
            binutils
            gnutar
            gzip
            xz
          ];

          buildInputs = with pkgs; [
            webkitgtk_4_1
            libsoup_3
            openssl
            librsvg
            libayatana-appindicator
            gtk3
            glib
            cairo
            pango
            gdk-pixbuf
            atk
            libnotify
          ];

          postPatch = ''
            # Extract caldir providers
            mkdir -p src-tauri/providers
            tar -xzf ${caldirProviders.${system}} -C src-tauri/providers
            chmod +x src-tauri/providers/caldir-provider-*
            echo "${caldirVersion} ${system}" > src-tauri/providers/.caldir-version

          '';

          buildPhase = ''
            runHook preBuild

            export HOME=$(mktemp -d)

            # Dummy signing key for Nix builds (auto-update disabled in Nix packages)
            export TAURI_SIGNING_PRIVATE_KEY="dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5ZnBFOXZUakpJeDNLclFSZ1B6NnRVdit0czJHRHJ4eUpSeU42OXBubG1BOEFBQUFDQUFBQUFBQUFBRUFBQUFBQS9McXVkYmtYR1pFOEFpbnJObi9KWFJWamh4STdVVVZkZ0dSaXRGSlB0Y1hORklPMUNBREFNK0lKWS9pazk5TGR6dnY4Z1dsQTlKR2JjSGtwUmVSY2xGbnNxVGtkS09oVURQNDY0eS9kSG9PVnVwUzVJTWZtUjB1RmdEUjA4MVVGT05KNjc2OGwrVHc9Cg=="
            export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="nixbuild"

            # Build frontend
            pnpm build

            # Build notifier daemon (Linux only)
            cd src-tauri
            cargo build --release -p rencal-notifierd
            cd ..

            # Build main app with deb bundle
            cargo tauri build --bundles deb

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out

            # Extract the deb package
            cd src-tauri/target/release/bundle/deb
            ar x *.deb

            # Create temp dir for extraction
            mkdir -p extracted

            # Handle different compression formats
            if [ -f data.tar.zst ]; then
              ${pkgs.zstd}/bin/zstd -d data.tar.zst
              tar -xf data.tar -C extracted
            elif [ -f data.tar.xz ]; then
              tar -xf data.tar.xz -C extracted
            elif [ -f data.tar.gz ]; then
              tar -xf data.tar.gz -C extracted
            else
              tar -xf data.tar.* -C extracted
            fi

            # Move usr contents to output
            cp -r extracted/usr/* $out/

            # Fix systemd service path
            if [ -f "$out/lib/systemd/user/rencal-notifierd.service" ]; then
              substituteInPlace $out/lib/systemd/user/rencal-notifierd.service \
                --replace-fail "/usr/bin/rencal-notifierd" "$out/bin/rencal-notifierd"
            fi

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "A modern open-source calendar app";
            homepage = "https://github.com/t4t5/rencal";
            license = licenses.mit;
            platforms = [ "x86_64-linux" "aarch64-linux" ];
            mainProgram = "rencal";
          };
        });
      in
      {
        packages = {
          default = rencal;
          inherit rencal;
        };

        apps.default = {
          type = "app";
          program = "${rencal}/bin/rencal";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Rust
            (rust-bin.stable.latest.default.override {
              extensions = [ "rust-src" "rust-analyzer" ];
            })

            # Node.js & pnpm
            nodejs_22
            pnpm

            # Tauri dependencies
            pkg-config
            webkitgtk_4_1
            libsoup_3
            openssl
            librsvg
            libayatana-appindicator
            gtk3
            glib
            cairo
            pango
            gdk-pixbuf
            atk
            libnotify

            # Build tools
            just
            cargo-tauri
          ];

          shellHook = ''
            export WEBKIT_DISABLE_COMPOSITING_MODE=1
          '';
        };
      }
    ) // {
      overlays.default = final: prev: {
        rencal = self.packages.${prev.system}.rencal;
      };
    };
}
