# Embedded provider AppImage crash

## Summary

Every `caldir-provider-*` executable inside renCal's Linux AppImage crashes with
`SIGSEGV` before reaching `main()`. The AppImage bundler (linuxdeploy, driven by
tauri-bundler) runs `patchelf --set-rpath '$ORIGIN'` on every ELF file it finds
under `usr/lib`, and that rewrite is fatal for the musl static-PIE provider
binaries.

Key facts, all verified on 2026-09-16:

- Every AppImage ever shipped is affected, from v0.0.1 (2026-04-25) through
  v0.7.1. The bug predates the `use-app-state-architecture` branch and the
  provider re-pinning in commit `7402bb0` (2026-09-08).
- The deb, rpm and AUR (`rencal-bin`, which repackages the deb) builds ship
  byte-identical, working providers.
- `just dev` is unaffected because it runs the pristine binaries from
  `src-tauri/providers/` directly. `just start` runs the AppImage and crashes.
- Neither the provider sync logic nor the `AppState` refactor is involved: the
  process dies during libc startup, before any iCloud/Google/network code runs.
- Nobody noticed because the AppImage was rarely run on the dev machine and the
  installed build comes from the AUR. AppImage users, including anyone updated
  through the in-app updater on Linux, have never had working iCloud or Google
  sync.

## Observed failure

Representative crash from `caldir-provider-icloud` (core dump PID 2247162,
2026-09-16 13:57:48 BST):

```text
Signal: SIGSEGV (SEGV_MAPERR)
#0  memcpy ()
#1  __copy_tls ()

rip = memcpy+36
rsi = 0x3fd070   # source: absolute, unmapped
rdi = 0x7fc892041018
rdx = 0xa0       # 160 bytes = the TLS image (PT_TLS p_filesz)
```

The fault address is identical across runs despite ASLR, and the kernel log
shows the same line each time:

```text
caldir-provider[1626194]: segfault at 3fd070 ip 00007febcbcf243a ... in caldir-provider-icloud[2f243a,...]
```

Both the iCloud and Google providers have crashed this way when launched from an
AppImage mount under `/tmp/.mount_renCal*/`.

## Root cause

### What the bundler does to the binary

The input provider is a musl static-PIE executable:

```text
ELF 64-bit LSB pie executable, x86-64, static-pie linked
```

|                      | `src-tauri/providers/caldir-provider-icloud` | AppDir copy                             |
| -------------------- | -------------------------------------------- | --------------------------------------- |
| SHA-256              | `33bec6e8…a003`                              | `3ffda78a…0580`                         |
| RUNPATH              | none                                         | `$ORIGIN`                               |
| PT_DYNAMIC vaddr     | `0x41fea0`                                   | `0x426268` (new PT_LOAD at end of file) |
| old `.dynamic` bytes | real tags                                    | filled with `X` (0x58)                  |

Running linuxdeploy's own bundled `patchelf 0.8` on the pristine binary with
`--set-rpath '$ORIGIN'` reproduces the AppDir copy byte for byte (same SHA-256),
and that copy segfaults on its own. A current patchelf 0.19.1 corrupts it the
same way, so this is not a patchelf version bug.

### Why that kills a static-PIE

patchelf moves `.dynamic` into a new load segment at the end of the file and
overwrites the old section with `X` bytes. A normal dynamic executable does not
care: ld.so finds the section through the PT_DYNAMIC header.

A musl static-PIE has no ld.so. Its startup code (`_dlstart_c` from `rcrt1.o`)
locates the dynamic section through the link-time `_DYNAMIC` symbol, which
still points at the old, now garbage, location. It therefore applies zero
relocations. `__init_tls` then derives the load base as `_DYNAMIC` minus the
PT_DYNAMIC vaddr, mixing the unrelocated old value with the new header:

```text
base      = 0x41fea0 - 0x426268 = -0x63c8
TLS image = 0x403438 + base     =  0x3fd070   <- exactly the faulting rsi
```

`__copy_tls` then memcpy's 160 bytes from that unmapped address.

### Where it happens in the pipeline

`@tauri-apps/cli` 2.11.4 drives linuxdeploy from Rust
(`crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy.rs`):

1. `debian::generate_data` builds `bundle/appimage_deb/data/usr/...`;
   `bundle.resources` land in `usr/lib/renCal/`.
2. `fs_utils::copy_custom_files(bundle.linux.appimage.files, data_dir)` copies
   extra files. Absolute keys are made relative to `data_dir`; directories are
   copied recursively.
3. `data/usr/` is copied into `renCal.AppDir/usr/`.
4. One `linuxdeploy --appdir … --plugin gtk --output appimage` call both patches
   the AppDir and produces the `.AppImage`. There is no hook in between.

linuxdeploy's "Deploying dependencies for existing files in AppDir" pass walks
`usr/bin` and `usr/lib` recursively and sets an rpath on every ELF that has a
PT_DYNAMIC header. Verified with a scratch AppDir:

| File                                   | Result                                                  |
| -------------------------------------- | ------------------------------------------------------- |
| static-PIE under `usr/lib/…`           | rewritten, RUNPATH `$ORIGIN`, crashes                   |
| fully static non-PIE under `usr/lib/…` | skipped ("Not setting rpath in statically-linked file") |
| static-PIE under `usr/libexec/…`       | untouched                                               |
| static-PIE under `usr/share/…`         | untouched                                               |

Because Tauri resources always land in `usr/lib/<productName>/`, there is no
configuration that excludes them from this pass. Pointing linuxdeploy's
`PATCHELF` env var at a newer patchelf does not help (see above).

## History: why it only surfaced now

| Release | Date       | Embedded iCloud provider                 |
| ------- | ---------- | ---------------------------------------- |
| v0.0.1  | 2026-04-25 | static-PIE, RUNPATH `$ORIGIN`, segfaults |
| v0.6.0  | 2026-07-31 | same                                     |
| v0.6.4  | 2026-09-01 | same                                     |
| v0.7.1  | 2026-09-15 | same                                     |

- `aur/PKGBUILD-bin.template` downloads the release `.deb` and extracts its
  `data.tar.gz`. The deb never goes through linuxdeploy. The installed
  `/usr/lib/renCal/providers/caldir-provider-icloud` on the dev machine matches
  the pristine hash and has no RUNPATH.
- Bundled providers override same-named PATH providers in every caldir-core
  version since 0.11.1 (`ProviderRegistry::add_from_dir` inserts by slug; there
  is a unit test for it). The working glibc providers in `~/.cargo/bin` were
  never used by the AppImage.
- The providers inside every AppImage have the executable bit set, so the
  registry did not skip them.
- The journal (retained since 2026-06-15) shows AppImage mounts on only six days
  between June and August, mostly single launches, then six on 2026-09-10 and
  seven on 2026-09-16. No provider segfault is logged before 2026-09-10, and the
  same search finds the September crashes. Auto sync is opt-in, so earlier
  launches most likely never spawned a provider.

## Reproduction

Any of these, after `just build` on Linux:

```bash
# 1. Run the AppDir copy directly (pristine copy exits 0):
src-tauri/target/release/bundle/appimage/renCal.AppDir/usr/lib/renCal/providers/caldir-provider-icloud --help
echo $?   # 139

# 2. Compare input vs AppDir copy:
input=src-tauri/providers/caldir-provider-icloud
embedded=src-tauri/target/release/bundle/appimage/renCal.AppDir/usr/lib/renCal/providers/caldir-provider-icloud
sha256sum "$input" "$embedded"
readelf -dW "$embedded" | grep -E 'RPATH|RUNPATH'
readelf -lW "$input" "$embedded" | grep DYNAMIC

# 3. Reproduce with patchelf alone (any version):
cp "$input" /tmp/x && patchelf --set-rpath '$ORIGIN' /tmp/x && /tmp/x --help; echo $?

# 4. Reproduce linuxdeploy's scan on a scratch AppDir:
mkdir -p AppDir/usr/lib/t AppDir/usr/libexec/t
cp "$input" AppDir/usr/lib/t/; cp "$input" AppDir/usr/libexec/t/
~/.cache/tauri/linuxdeploy-x86_64.AppImage --appimage-extract-and-run --appdir AppDir
cmp "$input" AppDir/usr/lib/t/caldir-provider-icloud      # differs
cmp "$input" AppDir/usr/libexec/t/caldir-provider-icloud  # identical
```

The deb is the control: its `usr/lib/renCal/providers/*` match the inputs.

## Fix plan

Goal: the providers inside the AppImage are byte-identical to
`src-tauri/providers/*`, and CI fails if they are not.

### 1. Ship the providers outside linuxdeploy's scan paths

In `src-tauri/tauri.conf.json`, add the providers directory as an AppImage
custom file at a path linuxdeploy ignores:

```json
"linux": {
  "appimage": {
    "files": {
      "/usr/libexec/renCal/providers": "providers"
    }
  }
}
```

`copy_custom_files` strips the leading slash, copies the directory recursively
and runs before linuxdeploy, so the copies stay pristine. The source path is
relative to `src-tauri/`, like the existing `deb.files` entries.

### 2. Stop shipping the providers as `resources` on Linux

If the providers stay in `bundle.resources`, the AppImage still carries a
second, patched copy under `usr/lib/renCal/providers/` (about 38 MB of dead
weight), and deb/rpm keep using resources. Cleaner:

- Add `src-tauri/tauri.linux.conf.json` (same mechanism as the existing
  `tauri.macos.conf.json`) that sets `bundle.resources` to just
  `icons/128x128.png`.
- Add `"/usr/lib/renCal/providers": "providers"` to both `deb.files` and
  `rpm.files`, so deb/rpm/AUR keep their current on-disk path and nothing
  changes for those users.
- Verify after a build that the platform config replaces the resources array
  rather than merging with it (inspect `renCal.AppDir/usr/lib/renCal/`).

macOS and Windows keep using `bundle.resources` unchanged.

### 3. Resolve the new location at runtime

`bundled_providers_dir` in `src-tauri/src/lib.rs` currently returns
`resource_dir()/providers`. On Linux, `resource_dir()` is
`<exe_dir>/../lib/renCal`, which inside the AppImage is
`/tmp/.mount_*/usr/lib/renCal`. Change the release-build branch to try, in
order, and return the first directory that exists:

1. `<exe_dir>/../libexec/renCal/providers` (AppImage)
2. `resource_dir()/providers` (deb, rpm, macOS, Windows)

Derive `exe_dir` from `std::env::current_exe()`. Keep the debug-build branch
and the chmod loop as they are. Add a small unit test for the candidate
ordering if the resolution is factored into a pure function taking the
candidate paths.

### 4. Regression test

Add `scripts/check-bundled-providers.sh`, run on Linux after bundling:

```bash
#!/usr/bin/env bash
# Fail if any provider inside the built AppImage or deb differs from its input.
set -euo pipefail
cd "$(dirname "$0")/.."

bundle=src-tauri/target/release/bundle
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

appimage=$(ls "$bundle"/appimage/*.AppImage)
(cd "$work" && "$OLDPWD/$appimage" --appimage-extract 'usr/libexec/renCal/providers/*' >/dev/null)

deb=$(ls "$bundle"/deb/*.deb)
(cd "$work" && ar x "$OLDPWD/$deb" data.tar.gz && tar -xzf data.tar.gz --wildcards '*/providers/*')

status=0
for input in src-tauri/providers/caldir-provider-*; do
  name=$(basename "$input")
  for copy in \
    "$work/squashfs-root/usr/libexec/renCal/providers/$name" \
    "$work/usr/lib/renCal/providers/$name"; do
    if ! cmp --silent "$input" "$copy"; then
      echo "packaging modified or dropped $copy" >&2; status=1; continue
    fi
    if readelf -dW "$copy" | grep -qE 'RPATH|RUNPATH'; then
      echo "$copy has an RPATH/RUNPATH" >&2; status=1
    fi
    # The real test: a corrupted static-PIE dies before main().
    if ! "$copy" --help >/dev/null 2>&1; then
      echo "$copy crashes on startup" >&2; status=1
    fi
  done
done

# No stray patched copies left in the AppImage's old resource path.
(cd "$work" && "$OLDPWD/$appimage" --appimage-extract 'usr/lib/renCal/providers/*' >/dev/null 2>&1 || true)
if ls "$work"/squashfs-root/usr/lib/renCal/providers/caldir-provider-* >/dev/null 2>&1; then
  echo "AppImage still ships providers under usr/lib/renCal/providers" >&2; status=1
fi
exit $status
```

Wire it in:

- `justfile`: run it at the end of `build` on Linux.
- `.github/workflows/ci.yml`: add a Linux job that installs the real providers
  via `scripts/install-caldir-providers.sh` (the existing CI job only creates
  empty placeholders), builds only the AppImage and deb bundles with
  `pnpm tauri build --bundles appimage,deb`, and runs the script. Running the
  embedded provider with `--help` is what catches the crash regardless of the
  mechanism; the `cmp` and `readelf` checks explain _why_ when it fails.
- `.github/workflows/release.yml`: tauri-action builds and uploads in one step,
  so add a follow-up job that downloads the just-published AppImage and deb and
  runs the same checks, failing the workflow if they fail.

### 5. Manual verification

```bash
just build && scripts/check-bundled-providers.sh
just start   # then trigger an iCloud/Google sync; coredumpctl list must show no new caldir-provider crash
```

## Rejected alternatives

- **Replace providers after linuxdeploy, before packing.** Impossible inside
  Tauri's flow: a single linuxdeploy call patches and packs. It would need
  extract + re-pack + re-sign, which conflicts with tauri-action's upload and
  the updater signature.
- **Newer patchelf via `PATCHELF` env.** patchelf 0.19.1 corrupts the binary
  the same way.
- **Build providers as fully static non-PIE.** linuxdeploy skips those (with a
  patchelf error in the build log), but it is a caldir-side toolchain change
  and does nothing for already-published caldir releases.
- **Dynamically linked (glibc) providers.** Would survive patchelf but gives up
  the portability the musl builds exist for.

## Impact

- No user data is affected: the provider exits before any sync starts.
- Every AppImage release so far cannot sync iCloud or Google. deb, rpm and AUR
  builds are fine and are the workaround until the fix ships.
