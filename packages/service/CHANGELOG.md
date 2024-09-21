# Changelog

## [0.2.6](https://github.com/yioneko/vtsls/compare/service-v0.2.5...service-v0.2.6) (2024-09-21)


### Bug Fixes

* correct line text shim ([2a508d3](https://github.com/yioneko/vtsls/commit/2a508d35fb57690d2e91de310769ceba48bf13ec))
* **deps:** update dependency typescript to v5.5.3 ([9d2f275](https://github.com/yioneko/vtsls/commit/9d2f2755e0e8d741929eddae9311b7c20e8c9e44))
* **deps:** update dependency typescript to v5.5.4 ([f26c8a4](https://github.com/yioneko/vtsls/commit/f26c8a4ae3691bc5dbaad10a0ec3531bc626bc44))
* **deps:** update dependency typescript to v5.6.2 ([#203](https://github.com/yioneko/vtsls/issues/203)) ([51b2b6d](https://github.com/yioneko/vtsls/commit/51b2b6daa23f255716f83241b18d8e218e933d2d))
* **deps:** update dependency vscode-languageserver-textdocument to ^1.0.12 ([bbe6d6f](https://github.com/yioneko/vtsls/commit/bbe6d6f3b50a3ae9d929a65bbb5e9db07e25ce49))
* **deps:** update packages/service/vscode digest to 65d85f4 ([#204](https://github.com/yioneko/vtsls/issues/204)) ([88b9d36](https://github.com/yioneko/vtsls/commit/88b9d36e5cc650a8ae97ca9c332aaca3060edfc9))
* **deps:** update packages/service/vscode digest to cf08702 ([d180d88](https://github.com/yioneko/vtsls/commit/d180d88c7a85b7d6aa53b11c278ecb736e186167))
* disable language mode check in ts extension ([0834c3b](https://github.com/yioneko/vtsls/commit/0834c3bf9350542ffbce2cca382ee2befb40e9ba))
* suppress document not found error ([23f922e](https://github.com/yioneko/vtsls/commit/23f922ee2840d2a42588e77cc2167d4d1916b59a))

## [0.2.5](https://github.com/yioneko/vtsls/compare/service-v0.2.4...service-v0.2.5) (2024-07-03)


### Features

* truncate inlay hint by setting ([#173](https://github.com/yioneko/vtsls/issues/173)) ([95b51bd](https://github.com/yioneko/vtsls/commit/95b51bde14b098ffb4760630821027c6a2fe84da))


### Bug Fixes

* handle zipfile uri with yarn pnp and neovim ([#179](https://github.com/yioneko/vtsls/issues/179)) ([a6bb7f7](https://github.com/yioneko/vtsls/commit/a6bb7f7a0507254da6c40e9a6900aa73a2aaa073))
* suppress provider not found error for some features ([9dff5e3](https://github.com/yioneko/vtsls/commit/9dff5e3ee5268720648033d661994ac4d160c0cf))
* uncaught tsserver error makes server crashed ([00f766e](https://github.com/yioneko/vtsls/commit/00f766e9bbefb9ee6dfcb7d62ba3befaf0b32b4a))

## [0.2.4](https://github.com/yioneko/vtsls/compare/service-v0.2.3...service-v0.2.4) (2024-06-21)


### Bug Fixes

* correct default triggerCharacter if context not provided ([f0beac0](https://github.com/yioneko/vtsls/commit/f0beac03e90531ea17d37a134d4af83c94132b2c))
* **deps:** update dependency typescript to v5.5.2 ([#175](https://github.com/yioneko/vtsls/issues/175)) ([6ac192f](https://github.com/yioneko/vtsls/commit/6ac192f92e21e19336a2436b0fdc9866808ca7ac))
* **deps:** update packages/service/vscode digest to 4bbebd8 ([#176](https://github.com/yioneko/vtsls/issues/176)) ([ed837d5](https://github.com/yioneko/vtsls/commit/ed837d5621c832704ee357f8bb45adfc15f2ab57))
* docuemnt document typo ([#171](https://github.com/yioneko/vtsls/issues/171)) ([1adbcf3](https://github.com/yioneko/vtsls/commit/1adbcf3488769fdebd07455d3246877a62491de8))

## [0.2.3](https://github.com/yioneko/vtsls/compare/service-v0.2.2...service-v0.2.3) (2024-04-24)


### Bug Fixes

* **deps:** update dependency typescript to v5.4.5 ([d4c5ed9](https://github.com/yioneko/vtsls/commit/d4c5ed98fb3cd927ac29ff213f8a0d8e3a28aaac))
* **deps:** update packages/service/vscode digest to e46e2ab ([#152](https://github.com/yioneko/vtsls/issues/152)) ([ac4eac3](https://github.com/yioneko/vtsls/commit/ac4eac346090735a408ff12f8dc9d18681d7218e))
* expose `additionalTextEdits` from completion item ([8d68dec](https://github.com/yioneko/vtsls/commit/8d68dec470e3c00a096e2f5d31baa00db94fa2f2)), closes [#156](https://github.com/yioneko/vtsls/issues/156)

## [0.2.2](https://github.com/yioneko/vtsls/compare/service-v0.2.1...service-v0.2.2) (2024-04-15)


### Features

* custom global typescript plugins ([#149](https://github.com/yioneko/vtsls/issues/149)) ([c8068a8](https://github.com/yioneko/vtsls/commit/c8068a833be759bbb52fc650f6f6549564f64194))


### Bug Fixes

* **deps:** update dependency typescript to v5.4.3 ([41ad8c9](https://github.com/yioneko/vtsls/commit/41ad8c9d3f9dbd122ce3259564f34d020b7d71d9))

## [0.2.1](https://github.com/yioneko/vtsls/compare/service-v0.2.0...service-v0.2.1) (2024-03-18)


### Features

* configurable global tsdk ([#144](https://github.com/yioneko/vtsls/issues/144)) ([9d7de42](https://github.com/yioneko/vtsls/commit/9d7de42a48bb6d4a8cd1441b7fef2b473be8e652))

## [0.2.0](https://github.com/yioneko/vtsls/compare/service-v0.1.25...service-v0.2.0) (2024-03-13)


### ⚠ BREAKING CHANGES

* deprecate support for node 14 ([#131](https://github.com/yioneko/vtsls/issues/131))

### Bug Fixes

* **deps:** update dependency typescript to v5.4.2 ([1872b8e](https://github.com/yioneko/vtsls/commit/1872b8ebf0855c48e80151a48df394fa4b747807))
* **deps:** update packages/service/vscode digest to 9fda43d ([#141](https://github.com/yioneko/vtsls/issues/141)) ([983dbe5](https://github.com/yioneko/vtsls/commit/983dbe5f5a3507343db1c60ac0984c12bcc7809a))


### Miscellaneous Chores

* deprecate support for node 14 ([#131](https://github.com/yioneko/vtsls/issues/131)) ([a24ea28](https://github.com/yioneko/vtsls/commit/a24ea28d5d288343ff500342371ace73374dac63))

## [0.1.25](https://github.com/yioneko/vtsls/compare/service-v0.1.24...service-v0.1.25) (2024-01-25)


### Features

* auto use workspace tsdk ([#135](https://github.com/yioneko/vtsls/issues/135)) ([cd76ab3](https://github.com/yioneko/vtsls/commit/cd76ab38f3bdf5577bead3c966678d5804d2977d))


### Bug Fixes

* check code action resolve support of client ([7f00332](https://github.com/yioneko/vtsls/commit/7f003323a8f50a392cb848643a7144a49637e9de))

## [0.1.24](https://github.com/yioneko/vtsls/compare/service-v0.1.23...service-v0.1.24) (2024-01-16)


### Features

* initial support for move to file action ([66add99](https://github.com/yioneko/vtsls/commit/66add9918f7511612c214c3ab354d090e61469fa))


### Bug Fixes

* **deps:** update dependency @vscode/l10n to ^0.0.18 ([9ceedde](https://github.com/yioneko/vtsls/commit/9ceedde27bd0618cfe8e11253128721b96ce5cae))
* **deps:** update dependency typescript to v5.3.3 ([2729ea6](https://github.com/yioneko/vtsls/commit/2729ea62788cdf3c55af789605d656f6b117d48c))
* **deps:** update packages/service/vscode digest to 3ddf196 ([#128](https://github.com/yioneko/vtsls/issues/128)) ([9a18b3e](https://github.com/yioneko/vtsls/commit/9a18b3e13ddfb014264e75a99f0c6dbecbfa45b0))
* **deps:** update packages/service/vscode digest to 860d670 ([#127](https://github.com/yioneko/vtsls/issues/127)) ([85300e5](https://github.com/yioneko/vtsls/commit/85300e58e44f9af060355a49836897614c1c45a6))

## [0.1.23](https://github.com/yioneko/vtsls/compare/service-v0.1.22...service-v0.1.23) (2023-12-10)


### Bug Fixes

* **deps:** update dependency typescript to v5.3.2 ([#117](https://github.com/yioneko/vtsls/issues/117)) ([c09af93](https://github.com/yioneko/vtsls/commit/c09af934bd7d0c39e37ea4d920976f055f0f674e))
* **deps:** update dependency vscode-languageserver-protocol to ^3.17.5 ([c648f26](https://github.com/yioneko/vtsls/commit/c648f262d743552d4a83735a4974bdd03bd99e17))
* **deps:** update dependency vscode-languageserver-textdocument to ^1.0.11 ([863f56a](https://github.com/yioneko/vtsls/commit/863f56a410ec77c828570670e87d68c42ed1f06c))
* **deps:** update dependency vscode-uri to ^3.0.8 ([4e79d6f](https://github.com/yioneko/vtsls/commit/4e79d6ffa412b72d7842a224dfef642aed573d02))
* Get response with decoded URI ([#121](https://github.com/yioneko/vtsls/issues/121)) ([c684cbe](https://github.com/yioneko/vtsls/commit/c684cbe200de902e990652246c7743bdcc6df33e))

## [0.1.22](https://github.com/yioneko/vtsls/compare/service-v0.1.21...service-v0.1.22) (2023-10-17)


### Bug Fixes

* configuration update ([519f558](https://github.com/yioneko/vtsls/commit/519f558e564daaeb1228e9919dce4f319eb81e5d))
* **deps:** update dependency vscode-languageserver-protocol to ^3.17.4 ([454eef4](https://github.com/yioneko/vtsls/commit/454eef48e7a7488648edb0219bed6a6c3dea16d9))
* **deps:** update packages/service/vscode digest to 257d2bf ([9ccb39d](https://github.com/yioneko/vtsls/commit/9ccb39d1b8fa7789168f50d2170764022ac71af3))
* **deps:** update packages/service/vscode digest to 686cf78 ([9c6cc03](https://github.com/yioneko/vtsls/commit/9c6cc03d9ec7f440a124515131f5fd102c01ada0))
* **deps:** update packages/service/vscode digest to e27a7d7 ([67cb08a](https://github.com/yioneko/vtsls/commit/67cb08a29e2e45138a9592458ff5a26a3ebfb96a))
* missing fields of URI object on the latest `vscode-uri` ([fe01185](https://github.com/yioneko/vtsls/commit/fe01185d881a115691d681eefd7dde55c4e920eb))

## [0.1.21](https://github.com/yioneko/vtsls/compare/service-v0.1.20...service-v0.1.21) (2023-08-26)


### Bug Fixes

* **deps:** update dependency @vscode/l10n to ^0.0.15 ([1220a67](https://github.com/yioneko/vtsls/commit/1220a6723a693d904a2b26f2d4990d7bdc2c504c))
* **deps:** update dependency @vscode/l10n to ^0.0.16 ([a221bc6](https://github.com/yioneko/vtsls/commit/a221bc6bdc5d8c9baeae5e912b3d41bd6f34d22c))
* **deps:** update dependency typescript to v5.1.6 ([5073548](https://github.com/yioneko/vtsls/commit/50735485c8e8eb00b874a891a9eb385bdaf91aa6))
* **deps:** update dependency typescript to v5.2.2 ([#97](https://github.com/yioneko/vtsls/issues/97)) ([6e397f1](https://github.com/yioneko/vtsls/commit/6e397f104953dced90c4987c24eca2d1b8d3c754))
* **deps:** update packages/service/vscode digest to 6243562 ([#88](https://github.com/yioneko/vtsls/issues/88)) ([a44f086](https://github.com/yioneko/vtsls/commit/a44f0869a1089b6f3416347ffff52391a2a321b3))
* **deps:** update packages/service/vscode digest to 6ea0992 ([0ba9e0b](https://github.com/yioneko/vtsls/commit/0ba9e0bacb5a1f4d2ef2e9fe314d6b29c8cbe95b))

## [0.1.20](https://github.com/yioneko/vtsls/compare/service-v0.1.19...service-v0.1.20) (2023-06-24)


### Bug Fixes

* missing private commands name in capabilities ([e6aeac9](https://github.com/yioneko/vtsls/commit/e6aeac98e91d6fcdb27c37644ca7dab9031ea506))

## [0.1.19](https://github.com/yioneko/vtsls/compare/service-v0.1.18...service-v0.1.19) (2023-06-24)


### Bug Fixes

* **deps:** update packages/service/vscode digest to 7ff66b3 ([4f3e0ce](https://github.com/yioneko/vtsls/commit/4f3e0cea6fc32d34cdd73fbe02685081eebd64b9))
* drop the hacky replacement of code action command ([#86](https://github.com/yioneko/vtsls/issues/86)) ([8b1cff9](https://github.com/yioneko/vtsls/commit/8b1cff978f280cd07570c38cb832c0ad31b59ad1))
* less strict checking of create file capability ([a870ab7](https://github.com/yioneko/vtsls/commit/a870ab7508ec18aaff9b7b9a7f8442fa2359b067))

## [0.1.18](https://github.com/yioneko/vtsls/compare/service-v0.1.17...service-v0.1.18) (2023-06-02)


### Features

* linked editing range ([#67](https://github.com/yioneko/vtsls/issues/67)) ([451943f](https://github.com/yioneko/vtsls/commit/451943f815fed2e0ba16045c405297c87db93cc9))


### Bug Fixes

* **deps:** bump typescript to 5.1.0 dev ([0022acb](https://github.com/yioneko/vtsls/commit/0022acbe1cb53c44bae747c262193bd81cd00707))
* **deps:** update dependency @vscode/l10n to ^0.0.14 ([5c53e98](https://github.com/yioneko/vtsls/commit/5c53e98002ae349be631224558505ded0d9dce4c))
* **deps:** update dependency typescript to v5.1.0-dev.20230515 ([74f69fd](https://github.com/yioneko/vtsls/commit/74f69fdcda13fa3b7b86cd73ac4c57968b51335b))
* **deps:** update dependency typescript to v5.1.3 ([3149515](https://github.com/yioneko/vtsls/commit/31495153915375c966832297e1b9b0a56715e9fe))
* **deps:** update packages/service/vscode digest to 60fe2d5 ([#74](https://github.com/yioneko/vtsls/issues/74)) ([b18da2e](https://github.com/yioneko/vtsls/commit/b18da2e577301cdf49cd1de24b6f3f5460e84994))
* **deps:** update packages/service/vscode digest to 9084e08 ([ba2d0a9](https://github.com/yioneko/vtsls/commit/ba2d0a900d410e9fad9b8c2b5a6533262e1045a5))
* **deps:** update packages/service/vscode digest to fa8eefd ([#80](https://github.com/yioneko/vtsls/issues/80)) ([1ecf6bb](https://github.com/yioneko/vtsls/commit/1ecf6bb30aa3cddd9ff38903eb6b95c3ff9fc7e1))
* hide unsupported move to file action ([bd040c5](https://github.com/yioneko/vtsls/commit/bd040c522b363a8f8dc4280f85e32bd49a101ced))
* link rendering in hover content ([102c73a](https://github.com/yioneko/vtsls/commit/102c73a429100a9ed2f983c448a264ca57a17f16))
* patch `javascript.goToProjectConfig` command ([8ac1796](https://github.com/yioneko/vtsls/commit/8ac17967b1bf627a1cbde538f1fe30ddd0bae2bc))

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
