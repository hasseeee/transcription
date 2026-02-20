const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metroサーバーに '.bin' 拡張子を認識（バンドル）させるための追加設定
config.resolver.assetExts.push('bin');

module.exports = config;