# Satoshi

Sabha uses the [Satoshi](https://www.fontshare.com/fonts/satoshi) variable
typeface from Fontshare / Indian Type Foundry.

The ITF Free Font License (FFL) permits self-hosting on our own infrastructure
for this application, but it does not permit redistributing the font software
through a repository. The two `.woff2` files in this directory are therefore
ignored by git and fetched from Fontshare by:

```bash
npm run fonts:fetch
```

`predev` and `prebuild` run the same command when the files are missing. The
official license text is kept in `FFL.txt`. Do not commit the font binaries.
