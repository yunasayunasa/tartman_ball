# 第三者依存・素材一覧

確認日: 2026-09-10。npmの固定リリースを使用し、正確な配布URLとintegrityは `package-lock.json` に記録しています。参考ゲームからのソースコピーや未許諾素材の流用はありません。

## 実行時依存

| 依存                      | 版      | 出典                                                                                                    | ライセンス | 使用箇所                                   |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| Three.js                  | 0.180.0 | [公式](https://threejs.org/) / [ソース](https://github.com/mrdoob/three.js/tree/r180)                   | MIT        | 描画、GLTFLoader、アニメーション、姿勢計算 |
| @dimforge/rapier3d-compat | 0.19.3  | [公式](https://rapier.rs/) / [配布元](https://www.npmjs.com/package/@dimforge/rapier3d-compat/v/0.19.3) | Apache-2.0 | 球・足場・固定時間物理                     |

Three.jsの著作権表示とMIT全文、Rapierの公式Apache-2.0全文を `public/licenses/` に収録し、ビルド時にも `dist/licenses/` にコピーします。Rapierの配布package.jsonは旧リポジトリ `dimforge/rapier.js` を参照しますが、上流は2026年に `dimforge/rapier` のtypescriptディレクトリへ統合されています。本作はnpmの0.19.3を固定して使います。

## 開発・検証依存

| 依存             | 版      | ライセンス | 用途                    |
| ---------------- | ------- | ---------- | ----------------------- |
| TypeScript       | 5.9.3   | Apache-2.0 | strict型検査            |
| Vite             | 8.2.2   | MIT        | 開発・静的ビルド        |
| Vitest           | 4.1.11  | MIT        | ロジック・実物理試験    |
| @playwright/test | 1.58.2  | Apache-2.0 | ブラウザー回帰試験      |
| @types/three     | 0.180.0 | MIT        | Three.js型定義          |
| @types/node      | 24.13.4 | MIT        | 検証設定のNode.js型定義 |
| Prettier         | 3.9.6   | MIT        | コード整形・整形確認    |

推移的な依存の正確な版・licenseはロックファイルの各package情報を参照してください。開発ツール本体は公開Webページへ配信しません。

## 素材

| 素材                                        | 出典・状態                              | 扱い                                                                                                                                  |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 支給キャラクターGLB・`NlaTrack`走行クリップ | ユーザー支給、Tripo生成、公開権利未確認 | `public/character.glb`、2,881,392 bytes、SHA-256 `683DCA055612791687EF5246114CBDE79D64E4A3EAE2FEA3C2A93257D3A0A370`。公開前に権利確認 |
| 仮マスコット、透明球、タルト、雲、浮島、旗  | この実装のプリミティブ形状とCanvas文字  | 外部画像・モデルなし。正式キャラの代替納品とはしない                                                                                  |
| 効果音                                      | Web Audioによる本作の短い正弦波合成     | 外部音源なし                                                                                                                          |
| BGM 6曲                                     | ユーザー支給、ゲームへの収録指定あり    | `public/bgm/` のMP3。ランダムまたは固定曲としてループ再生                                                                             |
| 書体                                        | 端末のシステムフォント                  | フォントファイルの再配布なし                                                                                                          |

本作ソース全体への公開OSSライセンスは未付与です。第三者ライブラリの許諾と、発注者素材／本作ソースの公開条件は別です。公開リポジトリでの再利用許諾を付ける場合は、発注者が適切なLICENSEを選択してください。

## 参照した一次資料

- [Device Orientation and Motion / W3C](https://www.w3.org/TR/orientation-event/) — 相対姿勢計算の入力定義。参考OSSの入力コードはコピーしていません。
- [Rapier: Forces and impulses](https://rapier.rs/docs/user_guides/javascript/rigid_body_forces_and_impulses/) — 横力と速度の制御。
- [Rapier: CCD](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/) — 高速移動の衝突検出。
- [Three.js: GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) / [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html) — キャラクター読み込み・走行。
- [Rapierライセンス原文](https://github.com/dimforge/rapier.js/blob/master/LICENSE) — 配布license表記との照合。
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) — 公開設定。
