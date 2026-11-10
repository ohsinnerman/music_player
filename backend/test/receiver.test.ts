import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

describe('GET /cast/receiver', () => {
  it('serves the Cast TV screen with a CSP that allows the Cast framework and LAN media', async () => {
    const { app } = makeTestApp();
    const r = await request(app).get('/cast/receiver').expect(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.text).toContain('cast_receiver_framework.js');
    expect(r.text).toContain('urn:x-cast:app.aura');
    const csp = r.headers['content-security-policy'];
    expect(csp).toContain('https://www.gstatic.com');
    expect(csp).toContain('media-src *');
    // The rest of the API keeps the locked-down policy.
    const api = await request(app).get('/v1/health');
    expect(api.headers['content-security-policy']).toContain("default-src 'none'");
    expect(api.headers['content-security-policy']).not.toContain('gstatic');
  });

  it('stays ES2015 for the 1st-gen Chromecast (no optional chaining / nullish coalescing)', async () => {
    const { app } = makeTestApp();
    const r = await request(app).get('/cast/receiver');
    const script = r.text.slice(r.text.lastIndexOf('<script>'));
    expect(script).not.toMatch(/\?\.|\?\?/);
  });
});
