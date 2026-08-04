// @vocab: 公開ステータス — 記事一覧と同じ記号方式を流用する。
function statusOf(article) {
  return article.status;
}

module.exports = { statusOf };
