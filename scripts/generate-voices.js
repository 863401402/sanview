'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var library = require('../js/voice-library.js');

var API_KEY = process.env.MIMO_API_KEY;
var BASE_URL = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '');
var MODEL = process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts-voicedesign';
var OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'audio');
var CONCURRENCY = Math.max(1, Math.min(4, parseInt(process.env.MIMO_TTS_CONCURRENCY, 10) || 2));
var FORCE = process.argv.indexOf('--force') !== -1;
var MP3_BITRATE = process.env.MIMO_TTS_BITRATE || '64k';
var VOICE_PROMPT = [
  '亲切、清晰、有耐心的小学女老师声音。',
  '普通话标准，年龄约二十五到三十五岁，语速稍慢，吐字清楚。',
  '声音明亮自然、鼓励但克制，不要夸张卖萌，不要播音腔。',
  '句尾平稳，适合六到十二岁儿童长时间听。'
].join('');

if (!API_KEY) {
  console.error('缺少 MIMO_API_KEY 环境变量。');
  process.exit(1);
}

var jobs = [];
Object.keys(library).forEach(function (key) {
  library[key].forEach(function (entry) {
    jobs.push({ key: key, text: entry.text, output: path.join(__dirname, '..', entry.path) });
  });
});

async function generate(job) {
  if (!FORCE && fs.existsSync(job.output)) {
    console.log('跳过 ' + path.basename(job.output));
    return;
  }
  var response = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: VOICE_PROMPT },
        { role: 'assistant', content: job.text }
      ],
      stream: false
    })
  });
  var data = await response.json();
  if (!response.ok) throw new Error(path.basename(job.output) + ': ' + JSON.stringify(data.error || data));
  var encoded = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.audio && data.choices[0].message.audio.data;
  if (!encoded) throw new Error(path.basename(job.output) + ': 响应中没有音频数据');
  var audio = Buffer.from(encoded, 'base64');
  if (audio.subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error(path.basename(job.output) + ': 返回内容不是 WAV');
  fs.mkdirSync(path.dirname(job.output), { recursive: true });
  var source = job.output + '.source.wav';
  fs.writeFileSync(source, audio);
  try {
    var result = childProcess.spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-codec:a', 'libmp3lame', '-b:a', MP3_BITRATE, '-ar', '24000', '-ac', '1', job.output
    ], { encoding: 'utf8' });
    if (result.error && result.error.code === 'ENOENT') {
      throw new Error('未找到 ffmpeg。请先安装 ffmpeg，再重新生成语音。');
    }
    if (result.status !== 0) {
      if (fs.existsSync(job.output)) fs.unlinkSync(job.output);
      throw new Error(path.basename(job.output) + ': MP3 转码失败：' + (result.stderr || result.error));
    }
  } finally {
    if (fs.existsSync(source)) fs.unlinkSync(source);
  }
  console.log('生成 ' + path.basename(job.output) + ' (' + Math.round(fs.statSync(job.output).size / 1024) + ' KB)');
}

async function worker(queue) {
  while (queue.length) await generate(queue.shift());
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  var queue = jobs.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, function () { return worker(queue); }));
  console.log('语音生成完成，共 ' + jobs.length + ' 条。');
}

main().catch(function (error) {
  console.error(error.message || error);
  process.exitCode = 1;
});
