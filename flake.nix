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
            hash = "sha256-mZD+rTN+WBzhptsPpB+9BDbJqGcogIhk5OvnhFJU4Fc=";
          };
          aarch64-linux = pkgs.fetchurl {
            url = "https://github.com/t4t5/caldir/releases/download/${caldirVersion}/caldir-aarch64-unknown-linux-musl.tar.gz";
            hash = "sha256-DCEnkXUfBTzjLv3R8jKkhVJGAkcAHhzHoT/GE0FGURQ=";
          };
        };

        rencal = pkgs.stdenv.mkDerivation {
          pname = "rencal";
          version = "0.7.0";

          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let
                baseName = builtins.baseNameOf path;
              in
              # Exclude build artifacts and dev files
              !(baseName == "target" ||
                baseName == "node_modules" ||
                baseName == "dist" ||
                baseName == ".git" ||
                baseName == "result" ||
                builtins.match ".*\\.log$" baseName != null);
          };

          nativeBuildInputs = with pkgs; [
            rustToolchain
            cargo-tauri
            nodejs_22
            pnpm_9
            pkg-config
            wrapGAppsHook3
            makeWrapper
            git
            cacert
            binutils # for ar (extracting deb)
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

          # Network access needed for cargo git deps and pnpm
          __noChroot = true;

          configurePhase = ''
            runHook preConfigure

            export HOME=$(mktemp -d)
            export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
            export GIT_SSL_CAINFO=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt

            # Extract caldir providers
            mkdir -p src-tauri/providers
            tar -xzf ${caldirProviders.${system}} -C src-tauri/providers
            chmod +x src-tauri/providers/caldir-provider-*
            echo "${caldirVersion} ${system}" > src-tauri/providers/.caldir-version

            # Install pnpm deps
            pnpm config set store-dir $HOME/.pnpm-store
            pnpm install --frozen-lockfile

            runHook postConfigure
          '';

          buildPhase = ''
            runHook preBuild

            # Build frontend
            pnpm build

            # Build notifier daemon (Linux only)
            cd src-tauri
            cargo build --release -p rencal-notifierd
            cd ..

            # Build main app with deb bundle (creates proper resource structure)
            cargo tauri build --bundles deb

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Extract the deb package
            mkdir -p $out
            ar x src-tauri/target/release/bundle/deb/*.deb
            tar -xf data.tar.* -C $out --strip-components=1

            # Rename the binary directory
            mv $out/usr/* $out/
            rmdir $out/usr

            # Move lib contents to share if applicable
            if [ -d "$out/lib" ]; then
              mkdir -p $out/share
              # Keep systemd service in lib
            fi

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
        };
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
            pnpm_9

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
