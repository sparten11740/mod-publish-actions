# mod-publish-actions

GitHub Actions for publishing Minecraft mods to CurseForge and Modrinth.

**Status:** early development. `modrinth/upload` and `modrinth/gallery` are implemented but have not run against Modrinth yet. `curseforge/upload` validates its inputs, then fails with "not implemented" until its API calls are written.

| Action              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `curseforge/upload` | Upload a file to a CurseForge project         |
| `modrinth/upload`   | Publish a file as a new Modrinth version      |
| `modrinth/gallery`  | Sync a folder of images to a Modrinth gallery |

CurseForge has no official gallery API, so its gallery stays manual through the Images tab in the Authors Console. Neither platform has a documented way to automate videos.

## Usage

Run the upload actions once per file, usually from a matrix. Run the gallery action once per project. Pin every action to a full commit SHA, because tags can be moved.

```yaml
- uses: sparten11740/mod-publish-actions/curseforge/upload@<commit-sha>
  with:
    token: ${{ secrets.CURSEFORGE_TOKEN }}
    project-id: ${{ vars.CURSEFORGE_PROJECT_ID }}
    file: jars/my-mod-*+${{ matrix.minecraft }}-${{ matrix.loader }}.jar
    game-versions: ${{ matrix.minecraft }}
    loaders: ${{ matrix.loader }}
    environment: client
    java-versions: ${{ matrix.java }}
    release-type: alpha
    changelog-file: CHANGELOG.md
    dependencies: fabric-api:required

- uses: sparten11740/mod-publish-actions/modrinth/upload@<commit-sha>
  with:
    token: ${{ secrets.MODRINTH_TOKEN }}
    project-id: ${{ vars.MODRINTH_PROJECT_ID }}
    file: jars/my-mod-*+${{ matrix.minecraft }}-${{ matrix.loader }}.jar
    version-number: ${{ github.ref_name }}+${{ matrix.minecraft }}-${{ matrix.loader }}
    game-versions: ${{ matrix.minecraft }}
    loaders: ${{ matrix.loader }}
    environment: client
    release-type: alpha
    changelog-file: CHANGELOG.md
    dependencies: fabric-api:required

- uses: sparten11740/mod-publish-actions/modrinth/gallery@<commit-sha>
  with:
    token: ${{ secrets.MODRINTH_TOKEN }}
    project-id: ${{ vars.MODRINTH_PROJECT_ID }}
    images: docs/images
    remove-missing: true
```

Each action's `action.yml` documents its inputs and outputs.

## Gallery sync

`modrinth/gallery` makes the gallery match a folder of images, and running it again changes nothing if the folder is unchanged.

- **Order:** images are sorted by file name, and numbers sort as numbers (`2-` before `10-`). The first image is featured.
- **Titles:** `01-crater-floor.jpg` becomes "Crater floor". Titles identify images between runs, so they must be unique.
- **Replacing an image:** give the new file a new name and set `remove-missing: true`. Modrinth's documented API has no way to tell that a file with the same name has new contents, so it is left as it is.
- **Removing images:** with `remove-missing: true`, images whose titles match no file are deleted, including ones you added by hand. A folder with no images always fails, so a wrong path can't empty the gallery.
- **Limits:** images can be at most 5 MiB. Descriptions set on Modrinth are left alone. Videos aren't supported.

## Development

See [AGENTS.md](AGENTS.md) for commands and conventions.
