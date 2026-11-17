import { describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  fetchPreview,
  isGenericImage,
  isGenericTitle,
  isPrivateAddress,
  parsePreview,
  titleFromAmazonUrl,
} from './scrape';

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
    expect(p.title).toBe('');
    expect(p.partial).toBe(true);
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
      partial: false,
    });
  });

  it('falls back to <title>, JSON-LD price, and finally an empty title', () => {
    const ld = `<title>Mug</title><script type="application/ld+json">{"offers":{"price":"12.50","priceCurrency":"eur"}}</script>`;
    const p = parsePreview(ld, new URL('https://www.shop.example/m'));
    expect(p.title).toBe('Mug');
    expect(p.price).toBe('12.50 EUR');
    expect(parsePreview('', new URL('https://www.shop.example/m'))).toMatchObject({ title: '', partial: true });
  });

  it('ignores non-http images', () => {
    const html = '<meta property="og:image" content="javascript:alert(1)">';
    expect(parsePreview(html, new URL('https://a.example')).image).toBeNull();
  });

  it('reads the product name and image from JSON-LD', () => {
    const html = `<title>Shop</title><script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Wool Socks","image":["https://shop.example/s.jpg"]}]}</script>`;
    expect(parsePreview(html, new URL('https://shop.example/s'))).toMatchObject({
      title: 'Wool Socks',
      image: 'https://shop.example/s.jpg',
      partial: false,
    });
  });
});

describe('generic and blocked results', () => {
  const amazon = new URL('https://www.amazon.ca/CAROTE-Cookware-Detachable-Induction-Dishwasher/dp/B0ABC12345?th=1');

  it('treats site names, errors and robot checks as generic titles', () => {
    for (const t of ['Amazon', 'Amazon.ca', 'amazon.com', 'Robot Check', 'Sorry!', 'Just a moment...', 'Attention Required! | Cloudflare']) {
      expect(isGenericTitle(t, amazon), t).toBe(true);
    }
    expect(isGenericTitle('CAROTE Cookware Set', amazon)).toBe(false);
    expect(isGenericTitle('Amazon Basics Yoga Mat', amazon)).toBe(false);
  });

  it('treats logos and non-product Amazon images as generic', () => {
    expect(isGenericImage('https://m.media-amazon.com/images/G/01/social_share/amazon_logo_500500._CB1.png', amazon)).toBe(true);
    expect(isGenericImage('https://m.media-amazon.com/images/G/01/anything.jpg', amazon)).toBe(true);
    expect(isGenericImage('https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg', amazon)).toBe(false);
    expect(isGenericImage('https://shop.example/assets/logo.png', new URL('https://shop.example'))).toBe(true);
    expect(isGenericImage('https://shop.example/img/blanket.jpg', new URL('https://shop.example'))).toBe(false);
  });

  it('derives a readable title from the Amazon URL slug', () => {
    expect(titleFromAmazonUrl(amazon)).toBe('CAROTE Cookware Detachable Induction Dishwasher');
    expect(titleFromAmazonUrl(new URL('https://www.amazon.com/dp/B0ABC12345'))).toBeNull();
    expect(titleFromAmazonUrl(new URL('https://www.amazon.com/gp/product/B0ABC12345'))).toBeNull();
    expect(titleFromAmazonUrl(new URL('https://shop.example/Some-Thing/dp/1'))).toBeNull();
  });

  it('falls back to the slug and no image when Amazon serves a bot check', () => {
    const html = `<html><head><title>Robot Check</title><meta property="og:title" content="Amazon">
      <meta property="og:image" content="https://m.media-amazon.com/images/G/01/logo.png"></head>
      <body>Enter the characters you see below</body></html>`;
    expect(parsePreview(html, amazon)).toEqual({
      title: 'CAROTE Cookware Detachable Induction Dishwasher',
      image: null,
      price: null,
      url: amazon.toString(),
      partial: true,
    });
  });

  it('skips a generic og:title for the real product title and image', () => {
    const html = `<title>Amazon.ca: CAROTE 21pcs Pots Set: Home &amp; Kitchen</title>
      <meta property="og:title" content="Amazon.ca">
      <meta property="og:image" content="https://m.media-amazon.com/images/G/01/amazon_logo.png">
      <span id="productTitle" class="a-size-large">  CAROTE 21pcs Pots and Pans Set  </span>
      <img id="landingImage" src="https://m.media-amazon.com/images/I/71abc._AC_SX679_.jpg">`;
    expect(parsePreview(html, amazon)).toMatchObject({
      title: 'CAROTE 21pcs Pots and Pans Set',
      image: 'https://m.media-amazon.com/images/I/71abc._AC_SX679_.jpg',
      partial: false,
    });
  });

  it('strips the Amazon prefix and category from a plain <title>', () => {
    const html = '<title>Amazon.ca: CAROTE 21pcs Pots Set: Home &amp; Kitchen</title>';
    expect(parsePreview(html, amazon).title).toBe('CAROTE 21pcs Pots Set');
  });

  it('sends browser-like headers and uses the slug when Amazon answers 503', async () => {
    let headers: Headers | undefined;
    const fetchImpl = (async (_u: unknown, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response('<title>Robot Check</title>', { status: 503, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
    const p = await fetchPreview(amazon.toString(), { fetchImpl, resolve: publicDns });
    expect(headers?.get('user-agent')).toMatch(/Chrome\//);
    expect(headers?.get('accept-language')).toMatch(/^fr/);
    expect(p).toMatchObject({ title: 'CAROTE Cookware Detachable Induction Dishwasher', image: null, partial: true });
  });
});
