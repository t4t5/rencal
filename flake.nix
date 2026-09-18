{
  description = "renCal - A modern open-source calendar app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    caldir = {
      url = "github:t4t5/caldir/v0.14.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, caldir }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs:
        let
          system = pkgs.stdenv.hostPlatform.system;
          caldirPkg = caldir.packages.${system}.caldir;
          rencal = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "rencal";
            version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

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
              allowBuiltinFetchGit = true;
            };

            nativeBuildInputs = with pkgs; [
              cargo
              rustc
              cargo-tauri
              nodejs_22
              pnpm
              pnpmConfigHook
              pkg-config
              wrapGAppsHook3
              makeWrapper
              rustPlatform.cargoSetupHook
              binutils
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
              mkdir -p src-tauri/providers
              cp ${caldirPkg}/bin/caldir-provider-* src-tauri/providers/
              chmod +x src-tauri/providers/caldir-provider-*
              substituteInPlace src-tauri/tauri.conf.json \
                --replace-fail '"version": "0.0.1"' '"version": "${finalAttrs.version}"'
            '';

            buildPhase = ''
              runHook preBuild

              cd src-tauri
              cargo build --release -p rencal-notifierd
              cd ..

              cargo tauri build --bundles deb \
                --config '{ "bundle": { "createUpdaterArtifacts": false } }'

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out
              cd src-tauri/target/release/bundle/deb
              ar x *.deb
              mkdir -p extracted

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

              cp -r extracted/usr/* $out/

              if [ -f "$out/lib/systemd/user/rencal-notifierd.service" ]; then
                substituteInPlace $out/lib/systemd/user/rencal-notifierd.service \
                  --replace-fail "/usr/bin/rencal-notifierd" "$out/bin/rencal-notifierd"
                sed -i "/^\\[Service\\]/a Environment=RENCAL_NOTIFIER_ICON=$out/share/icons/hicolor/128x128/apps/rencal.png" \
                  $out/lib/systemd/user/rencal-notifierd.service
              fi

              runHook postInstall
            '';

            preFixup = ''
              gappsWrapperArgs+=(
                --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.libnotify pkgs.xdg-utils ]}
              )
            '';

            meta = with pkgs.lib; {
              description = "A modern open-source calendar app";
              homepage = "https://github.com/t4t5/rencal";
              license = licenses.mit;
              platforms = systems;
              mainProgram = "rencal";
            };
          });
        in
        {
          default = rencal;
          inherit rencal;
        });

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.rencal}/bin/rencal";
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          buildInputs = with pkgs; [
            cargo
            rustc
            clippy
            rustfmt
            rust-analyzer
            nodejs_22
            pnpm
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
            just
            cargo-tauri
          ];

          shellHook = ''
            export WEBKIT_DISABLE_COMPOSITING_MODE=1
          '';
        };
      });

      overlays.default = final: prev: {
        rencal = self.packages.${prev.stdenv.hostPlatform.system}.rencal;
      };
    };
}
