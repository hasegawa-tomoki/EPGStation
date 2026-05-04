#!/usr/bin/env node
/*
 * EPGStation の recordingFinishCommand から呼び出されるラッパースクリプト。
 * 環境変数 TRANSCRIBE が "1" の時だけ transcribe サービス (compose 内ホスト名) に
 * POST して文字起こしジョブを enqueue する。
 *
 * 配置先 (ホスト): /var/data/epgstation/data/scripts/transcribe-hook.js
 * コンテナ視点  : /app/data/scripts/transcribe-hook.js
 *
 * config.yml 設定例:
 *   recordingFinishCommand: '/usr/local/bin/node /app/data/scripts/transcribe-hook.js'
 *
 * EPGStation の ProcessUtil.parseCmdStr は空白 split のみで quote 非対応のため、
 * sh -c や curl は使えない。Node 標準の http モジュールで完結させている。
 */
const http = require('http');

if (process.env.TRANSCRIBE !== '1') {
    process.exit(0);
}

const recordedId = process.env.RECORDEDID;
const recPath = process.env.RECPATH;
if (!recordedId || !recPath) {
    console.error('transcribe-hook: missing RECORDEDID or RECPATH');
    process.exit(0);
}

const payload = JSON.stringify({
    recordedId: parseInt(recordedId, 10),
    recPath,
    name: process.env.NAME || '',
    channelName: process.env.CHANNELNAME || '',
    description: process.env.DESCRIPTION || '',
});

const req = http.request(
    {
        hostname: process.env.TRANSCRIBE_HOST || 'transcribe',
        port: parseInt(process.env.TRANSCRIBE_PORT || '9999', 10),
        path: '/transcribe',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
    },
    res => {
        res.resume();
        res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
                console.error(`transcribe-hook: HTTP ${res.statusCode} for recordedId=${recordedId}`);
            }
            process.exit(0);
        });
    },
);

req.on('error', err => {
    console.error(`transcribe-hook: enqueue failed for recordedId=${recordedId}: ${err.message}`);
    process.exit(0);
});

req.on('timeout', () => {
    console.error(`transcribe-hook: timeout for recordedId=${recordedId}`);
    req.destroy();
});

req.write(payload);
req.end();
