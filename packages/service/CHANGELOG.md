# Changelog

## [0.1.17](https://github.com/yioneko/vtsls/compare/service-v0.1.16...service-v0.1.17) (2023-04-17)


### Bug Fixes

* **deps:** update dependency @vscode/l10n to ^0.0.13 ([c11e7a3](https://github.com/yioneko/vtsls/commit/c11e7a385cc78c0272893924a2dc5c20e9b734cb))
* **deps:** update dependency typescript to ^5.0.4 ([08e05cb](https://github.com/yioneko/vtsls/commit/08e05cbe9078fd146633b5bac5d04fc6aa4f73db))
* **deps:** update packages/service/vscode digest to 1e77437 ([#64](https://github.com/yioneko/vtsls/issues/64)) ([8f840e2](https://github.com/yioneko/vtsls/commit/8f840e27bbb6f993c6deb6fb636ad4ef2af1cc68))
* **deps:** update packages/service/vscode digest to 2da5a00 ([#63](https://github.com/yioneko/vtsls/issues/63)) ([6362e86](https://github.com/yioneko/vtsls/commit/6362e867be8091e00eb725dd82a56f0469535f06))
* **deps:** update packages/service/vscode digest to 6f59208 ([#60](https://github.com/yioneko/vtsls/issues/60)) ([c83be33](https://github.com/yioneko/vtsls/commit/c83be33a17c79208c668d7d6912826a77a82cfc8))

## [0.1.16](https://github.com/yioneko/vtsls/compare/service-v0.1.15...service-v0.1.16) (2023-03-21)


### Bug Fixes

* **deps:** update dependency typescript to v5 ([0bbc01b](https://github.com/yioneko/vtsls/commit/0bbc01baa819e4078d4f1adb5e65c5a45bbe7443))
* **deps:** update packages/service/vscode digest to 2f0f935 ([97f732f](https://github.com/yioneko/vtsls/commit/97f732f88aca9315e503906ac45ab62b7902ba65))
* missing completion length threshold ([39fb8c4](https://github.com/yioneko/vtsls/commit/39fb8c48e4279697b42f146f906261f2888d9272))

## [0.1.15](https://github.com/yioneko/vtsls/compare/service-v0.1.14...service-v0.1.15) (2023-03-13)


### Features

* server side filtering ([#50](https://github.com/yioneko/vtsls/issues/50)) ([2ba2de5](https://github.com/yioneko/vtsls/commit/2ba2de561412092fc35fecbcea91659f844ad3d4))


### Bug Fixes

* correctly set isIncomplete if filtering enabled ([830ce2f](https://github.com/yioneko/vtsls/commit/830ce2f2931b7467bae162b4178b2798f92a2355))
* **deps:** update packages/service/vscode digest to 95ee78f ([84e6f83](https://github.com/yioneko/vtsls/commit/84e6f83d982d36133938a03bec323458b1217503))
* ensure service to be the single instance ([07b7550](https://github.com/yioneko/vtsls/commit/07b75504e20d6f8cfe1551bc5999947c04f5a06b))
* order of semantic token modifiers ([db8d9f0](https://github.com/yioneko/vtsls/commit/db8d9f0bf5c33677036e5871c2a28bc15431ba60))
* slightly increase cache size for completion and code action ([4ab4bd0](https://github.com/yioneko/vtsls/commit/4ab4bd0e52d549990728241b0c48c4d27b5afe99))


### Performance Improvements

* memoize last complete completion result ([23b5782](https://github.com/yioneko/vtsls/commit/23b5782163ce564146f0be5af9d6ec3d53eafc99))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @vtsls/vscode-fuzzy bumped to 0.0.1

## [0.1.14](https://github.com/yioneko/vtsls/compare/service-v0.1.13...service-v0.1.14) (2023-03-05)


### Features

* initial support for document link ([ec94085](https://github.com/yioneko/vtsls/commit/ec9408525e0bb99e399a16f92fa59debbb2daa95))


### Bug Fixes

* check insertReplaceEdit capability of client ([bcdd593](https://github.com/yioneko/vtsls/commit/bcdd593e39d41585eb1de251385506a6651258f8))
* improve service initialization ([aaa1932](https://github.com/yioneko/vtsls/commit/aaa19329ccc96b8a291a7db38ee124cf7f842c73))
* make service really disposable ([77553f2](https://github.com/yioneko/vtsls/commit/77553f2429baa904eb3732b289695f1f37dd00a9))

## [0.1.13](https://github.com/yioneko/vtsls/compare/service-v0.1.12...service-v0.1.13) (2023-03-01)


### Bug Fixes

* **deps:** update packages/service/vscode digest to f8119e9 ([#46](https://github.com/yioneko/vtsls/issues/46)) ([e438dd1](https://github.com/yioneko/vtsls/commit/e438dd14d974155752bcba0d19b00758b28eb404))

## [0.1.12](https://github.com/yioneko/vtsls/compare/service-v0.1.11...service-v0.1.12) (2023-02-09)


### Bug Fixes

* postinstall triggered in production install (fix [#38](https://github.com/yioneko/vtsls/issues/38)) ([e48430a](https://github.com/yioneko/vtsls/commit/e48430a73dbee2b0301806e7a1ef904cba115fc1))

## [0.1.11](https://github.com/yioneko/vtsls/compare/service-v0.1.10...service-v0.1.11) (2023-02-08)


### Bug Fixes

* cannot wait cache command ([545cb64](https://github.com/yioneko/vtsls/commit/545cb64a811df265ebb164425713f4036cdec700))
* check locationLink capabillity ([2342888](https://github.com/yioneko/vtsls/commit/2342888720a3c96d6294b8410c85863e5da8890e))
