# ElementChainer

ブラウザで遊べる小規模な現象連鎖バトルゲームです。

Heat / Shock / Resonance / Fragile を重ねると、Overload、Flash Conduct、Wave Spread、Shatter などが割り込み連鎖します。戦闘中に低確率で新技を閃き、勝利後は小さな現象強化を1つ選んで次Waveへ進みます。

解放技、発見済みリアクション、現象強化、ベストチェインは `localStorage` に保存されます。

## 起動方法

```bash
npm install
npm run dev
```

表示されたローカルURLをブラウザで開いてください。

## ビルド

```bash
npm run build
```

生成物は `dist/` に出力されます。Viteの `base` は相対パスにしているため、GitHub Pagesのサブディレクトリ配信でも動作します。

## GitHub Pages deploy

### GitHub Actionsで公開

1. GitHubのリポジトリ設定で `Settings > Pages` を開く
2. `Build and deployment` の `Source` を `GitHub Actions` にする
3. `main` ブランチへpushする

`.github/workflows/deploy.yml` が `npm run build` を実行し、`dist/` をGitHub Pagesへ公開します。

### 手元からgh-pagesへ公開

```bash
npm run deploy
```

この方法では `gh-pages` ブランチへ `dist/` をpushします。リポジトリ設定のPages公開元を `gh-pages` ブランチにしてください。
