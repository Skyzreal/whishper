import { describe, expect, it } from 'vitest';
import { assertPublicUrl, fetchPreview, isPrivateAddress, parsePreview } from './scrape';

const publicDns = async () => ['93.184.216.34'];

describe('SSRF guard', () => {
  it('flags private and special addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('rejects bad schemes, localhost and hosts resolving to private IPs', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('http://localhost:3000')).rejects.toThrow();
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertPublicUrl('https://sneaky.example', async () => ['10.0.0.1'])).rejects.toThrow();
    await expect(assertPublicUrl('https://shop.example', publicDns)).resolves.toBeInstanceOf(URL);
  });

  it('does not follow redirects to private addresses', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })) as unknown as typeof fetch;
    const p = await fetchPreview('https://shop.example/item', { fetchImpl, resolve: publicDns });
    expect(p.title).toBe('shop.example');
  });
});

describe('preview parsing', () => {
  it('reads Open Graph data and resolves relative images', () => {
    const html = `<head><title>Fallback</title>
      <meta property="og:title" content="Nice &amp; Cozy Blanket">
      <meta content="/img/b.jpg" property="og:image">
      <meta property="product:price:amount" content="29.99"><meta property="product:price:currency" content="USD"></head>`;
    expect(parsePreview(html, new URL('https://shop.example/p/1'))).toEqual({
      title: 'Nice & Cozy Blanket',
      image: 'https://shop.example/img/b.jpg',
      price: '29.99 USD',
      url: 'https://shop.example/p/1',
    });
  });

  it('falls back to <title>, JSON-LD price, and finally the hostname', () => {
    const ld = `<title>Mug</title><script type="application/ld+json">{"offers":{"price":"12.50","priceCurrency":"eur"}}</script>`;
    const p = parsePreview(ld, new URL('https://www.shop.example/m'));
    expect(p.title).toBe('Mug');
    expect(p.price).toBe('12.50 EUR');
    expect(parsePreview('', new URL('https://www.shop.example/m')).title).toBe('shop.example');
  });

  it('ignores non-http images', () => {
    const html = '<meta property="og:image" content="javascript:alert(1)">';
    expect(parsePreview(html, new URL('https://a.example')).image).toBeNull();
  });
});
