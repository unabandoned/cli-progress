const { describe, it } = require('node:test');
const _assert = require('assert');
const { Writable } = require('stream');
const _cliProgress = require('../../cli-progress');

// a writable that pretends to be a terminal and records what was written
function fakeTTY(columns = 120){
    const chunks = [];
    const stream = new Writable({
        write(chunk, enc, cb){
            chunks.push(chunk.toString());
            cb();
        }
    });
    stream.isTTY = true;
    stream.columns = columns;
    stream.output = () => chunks.join('');
    return stream;
}

// strip terminal control sequences from recorded output
function plain(s){
    return s.replace(/\x1B(?:\[[0-9;?]*[A-Za-z]|[78])/g, '');
}

describe('package exports', () => {
    it('should expose the public API', () => {
        _assert.strictEqual(_cliProgress.Bar, _cliProgress.SingleBar);
        _assert.strictEqual(typeof _cliProgress.SingleBar, 'function');
        _assert.strictEqual(typeof _cliProgress.MultiBar, 'function');
        _assert.strictEqual(typeof _cliProgress.Format.Formatter, 'function');
        for (const name of ['legacy', 'rect', 'shades_classic', 'shades_grey']){
            _assert.strictEqual(typeof _cliProgress.Presets[name].barCompleteChar, 'string', name);
        }
    });
});

describe('SingleBar', () => {
    // mirrors how CyberChef's test runner drives the bar: custom format
    // function, shades_classic preset, stopOnComplete, payload messages
    it('should render a custom formatter with payload and stop on complete', () => {
        const stream = fakeTTY();
        const seen = [];
        const bar = new _cliProgress.SingleBar({
            stream,
            format: (options, params, payload) => {
                seen.push({ ...params, msg: payload.msg });
                const done = options.barCompleteString.substr(0, Math.round(params.progress * options.barsize));
                return `${payload.msg} ${done} ${params.value}/${params.total}`;
            },
            stopOnComplete: true
        }, _cliProgress.Presets.shades_classic);

        bar.start(3, 0, { msg: 'Setting up' });
        bar.update(1, { msg: 'first' });
        bar.increment();
        bar.update(2, { msg: 'second' });
        bar.increment();

        _assert.strictEqual(bar.isActive, false, 'stopOnComplete stops the bar');
        const out = plain(stream.output());
        _assert.match(out, /Setting up {2}0\/3/);
        _assert.match(out, /second ███+ 3\/3\n$/);
        _assert.ok(seen.every((p) => p.maxWidth === 120 && p.total === 3));
    });

    it('should not render on a non-TTY stream by default', () => {
        const stream = fakeTTY();
        stream.isTTY = false;
        const bar = new _cliProgress.SingleBar({ stream }, _cliProgress.Presets.shades_classic);
        bar.start(10, 0);
        bar.update(5);
        bar.stop();
        _assert.strictEqual(stream.output(), '');
    });

    it('should render the default format with the preset characters', () => {
        const stream = fakeTTY();
        const bar = new _cliProgress.SingleBar({ stream, barsize: 10 }, _cliProgress.Presets.shades_classic);
        bar.start(4, 2);
        bar.stop();
        _assert.match(plain(stream.output()), /█████░░░░░ 50% \| ETA: \d+s \| 2\/4/);
    });
});

describe('alignment uses display width', () => {
    const options = {
        format: '{label}',
        align: 'right',
        barsize: 10,
        barCompleteString: '',
        barIncompleteString: '',
        autopadding: false,
        autopaddingChar: ''
    };
    const params = { progress: 0, eta: 0, startTime: 0, stopTime: 1, total: 1, value: 0, maxWidth: 20 };

    it('should count wide characters as two columns', () => {
        const s = _cliProgress.Format.Formatter(options, params, { label: '漢字' });
        _assert.strictEqual(s, ' '.repeat(14) + '漢字');
    });

    it('should ignore ANSI colour codes', () => {
        const s = _cliProgress.Format.Formatter(options, params, { label: '\x1B[31mab\x1B[39m' });
        _assert.strictEqual(s, ' '.repeat(16) + '\x1B[31mab\x1B[39m');
    });
});
