# Changelog

## [1.0.0](https://github.com/yioneko/vtsls/compare/v0.1.10...v1.0.0) (2023-02-01)


### ⚠ BREAKING CHANGES

* rename package to `@vtsls/language-server`
* split language service (closes #3)

### Features

* basic tests ([c258760](https://github.com/yioneko/vtsls/commit/c25876097025ad0bec03b4411d15a81dc0cde633))
* codelens resolve ([a264a05](https://github.com/yioneko/vtsls/commit/a264a05981505adf825936598ee22448ff89b8a2))
* default bundled with typescript ([832e556](https://github.com/yioneko/vtsls/commit/832e556ea6497c2890a7ceaa6a53ac8e4dc16d0f))
* drop code lens cache ([90732c7](https://github.com/yioneko/vtsls/commit/90732c7a750c080aa5876533387ccd86c2c7cecf))
* re-enable full semantic tokens capability ([ad05a1a](https://github.com/yioneko/vtsls/commit/ad05a1aee563fd9245c5072bb1dbc7ede4f41794))
* select tsserver version ([66776ba](https://github.com/yioneko/vtsls/commit/66776bac06c3bac3cfe1b0c74dd3589d45de6563))
* support update paths on rename ([8189703](https://github.com/yioneko/vtsls/commit/81897039569645082a4f734ec8e63c21028871f6))


### Bug Fixes

* add back missing ProgressLocation ([50b7679](https://github.com/yioneko/vtsls/commit/50b76792149c88849e426557594d630bd5be7c0a))
* call hierarchy regression ([ff3341e](https://github.com/yioneko/vtsls/commit/ff3341e1794ba74abafedfc8bb14abddece99be2))
* ci install ([640628b](https://github.com/yioneko/vtsls/commit/640628bd12fe13f9f246b1c1c7f0fa5c3b5f1ea0))
* client may not send didOpen notification after document open ([81ce84f](https://github.com/yioneko/vtsls/commit/81ce84f863d63c15892ddbc1aadc4f7be5e310fa))
* code action kinds ([5f02dda](https://github.com/yioneko/vtsls/commit/5f02dda67b6e9a2a340f4ad0b106c6d7917258f4))
* code action kinds test ([80a763b](https://github.com/yioneko/vtsls/commit/80a763ba8258c107a70cba54b801f81839475c6d))
* collect all commands name in capabilities ([94e9e85](https://github.com/yioneko/vtsls/commit/94e9e851000f6a7dfd768f912142b84856f3fac6))
* complete file rename registration options ([fb52b30](https://github.com/yioneko/vtsls/commit/fb52b308065c2f0cda4724471c9fbfd535c4df7f))
* completion trigger condition ([a12606e](https://github.com/yioneko/vtsls/commit/a12606eeed84bcdef96b0a1a34108b040dc925dc))
* **deps:** update dependency @vscode/l10n to ^0.0.11 ([#23](https://github.com/yioneko/vtsls/issues/23)) ([eec7c13](https://github.com/yioneko/vtsls/commit/eec7c13cc283ec1532c0b535bdac437d3acab014))
* disable full semantic tokens capability ([6610887](https://github.com/yioneko/vtsls/commit/66108876692e205a14201b9e7eacda202f067e1e))
* drop call hierarchy cache ([8578f8e](https://github.com/yioneko/vtsls/commit/8578f8e5386ec28d764c8ddcb07c5953d911adb8))
* empty code action kind should trigger all providers ([2fac440](https://github.com/yioneko/vtsls/commit/2fac440f37cb5e1c8551e9ec29501fe12d01adb4))
* empty renamed files cause error ([f0c3d5d](https://github.com/yioneko/vtsls/commit/f0c3d5dce89ce65ec0d8969cd56d69531731deaa))
* error in selection ranges ([585b0e8](https://github.com/yioneko/vtsls/commit/585b0e8c9b862cb51f474e847f142e3857008617))
* formatting options in request is not respected ([8631f47](https://github.com/yioneko/vtsls/commit/8631f47cf2645e5a56dc7d6d928542c2006d32db))
* getWorkspaceFolder failed ([6d5a546](https://github.com/yioneko/vtsls/commit/6d5a54613025c5ee7deb46081413a1df064c4e1a))
* lint error ([2f0919d](https://github.com/yioneko/vtsls/commit/2f0919d4133d26a6283705c864f1b0ad44141dfc))
* openTextDocument error on missing fields (fix [#27](https://github.com/yioneko/vtsls/issues/27)) ([e5cc0c7](https://github.com/yioneko/vtsls/commit/e5cc0c71f66d1335d05662d880adedfd9b651ac9))
* potential document out of sync ([709fa50](https://github.com/yioneko/vtsls/commit/709fa50b07f41736b9a695e314fb713ed84fa5ae))
* replace shell cp in patch script (fix [#25](https://github.com/yioneko/vtsls/issues/25)) ([9c2e85d](https://github.com/yioneko/vtsls/commit/9c2e85db4c11788191d13076786961dc0bb95582))
* replace word range implementaion with vscode's (fix [#31](https://github.com/yioneko/vtsls/issues/31)) ([9325292](https://github.com/yioneko/vtsls/commit/93252922088473e1a2576b4233d48723a92a074c))
* respect completion trigger character ([7129eb4](https://github.com/yioneko/vtsls/commit/7129eb4e19f70266384d1b35e38c1c144d6491cf))
* respect more client capabilities ([ba3513e](https://github.com/yioneko/vtsls/commit/ba3513ef822f4db826e79b6e0831976818ed2bfd))
* return file references response ([168425f](https://github.com/yioneko/vtsls/commit/168425ff510b57c45f7980d469b7dc6b218f98c7))
* support directory rename path update ([e9dcd93](https://github.com/yioneko/vtsls/commit/e9dcd93dab99f9f5e6ede3a97b8ecacfdf42bf82))
* support full semantic tokens ([6894843](https://github.com/yioneko/vtsls/commit/6894843615250276e82c6787d703f32324ce6053))
* temporary workaround for tsserver bug ([0848b11](https://github.com/yioneko/vtsls/commit/0848b11c87fa69df45cdcd4d328be5e346a0ae5a))
* typos ([0dadc57](https://github.com/yioneko/vtsls/commit/0dadc579f969909f4aaee8ff57a016fab23e26d8))
* wait language features registration (fix [#24](https://github.com/yioneko/vtsls/issues/24)) ([1e17fc9](https://github.com/yioneko/vtsls/commit/1e17fc99a9ec2483b12dc1f3c7522b2defb29f8f))
* windows url path resolve ([648564c](https://github.com/yioneko/vtsls/commit/648564cd033955085c4a34fbc698f8cd67bfb1a0))
* wrong dependants ([1f8055e](https://github.com/yioneko/vtsls/commit/1f8055e04b9385fda19512564aefd8528d189c83))


### Code Refactoring

* split language service (closes [#3](https://github.com/yioneko/vtsls/issues/3)) ([1ee3d19](https://github.com/yioneko/vtsls/commit/1ee3d19fb642d90a5cf5f022a0d3d4c5e6c7da80))


### Miscellaneous Chores

* rename package to `@vtsls/language-server` ([b7b5c76](https://github.com/yioneko/vtsls/commit/b7b5c76d123cbb7059aade7ddc255ca377e4144b))
