import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
vi.mock('@/services/apiClient', () => ({ apiClient: { post } }));

import { runOnServer } from './codeRunners';

const scannerCrash = {
  run: {
    stdout: 'Enter your name: ',
    stderr: 'Exception in thread "main" java.util.NoSuchElementException: No line found',
    code: 1,
  },
};

describe('runOnServer', () => {
  beforeEach(() => post.mockReset());

  it('sends the input box text as the program’s keyboard input', async () => {
    post.mockResolvedValue({ data: { run: { stdout: 'Hello Budi, you are 30 years old!\n', stderr: '', code: 0 } } });
    const res = await runOnServer('java', 'Java', 'InputExample.java', 'class X {}', 'Budi\n30\n');

    expect(post).toHaveBeenCalledWith('/code/run', {
      language: 'java',
      file_name: 'InputExample.java',
      code: 'class X {}',
      stdin: 'Budi\n30\n',
    });
    expect(res.success).toBe(true);
    expect(res.logs.some((l) => l.content === 'Hello Budi, you are 30 years old!')).toBe(true);
  });

  it('leaves stdin out when the box is empty', async () => {
    post.mockResolvedValue({ data: { run: { stdout: '', stderr: '', code: 0 } } });
    await runOnServer('java', 'Java', 'Main.java', 'class X {}');
    expect(post.mock.calls[0][1].stdin).toBeUndefined();
  });

  it('points to the Input box when a program waits for input that was never given', async () => {
    post.mockResolvedValue({ data: scannerCrash });
    const res = await runOnServer('java', 'Java', 'InputExample.java', 'class X {}');

    expect(res.success).toBe(false);
    expect(res.logs.some((l) => l.type === 'warn' && l.content.includes('Input box'))).toBe(true);
  });

  it('says more lines are needed when the input runs out', async () => {
    post.mockResolvedValue({ data: scannerCrash });
    const res = await runOnServer('java', 'Java', 'InputExample.java', 'class X {}', 'Budi');

    expect(res.logs.some((l) => l.type === 'warn' && l.content.includes('more input than the Input box has'))).toBe(true);
  });
});
