# Changelog

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
