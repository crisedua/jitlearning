import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mintLabToken, readLabToken, LAB_TOKEN_TTL_SECONDS } from './lab-token';

const UID = '2b0f3d54-9a1e-4c77-91cc-6f0f9c2a7e10';

before(() => {
  process.env.INGEST_SECRET ??= 'a'.repeat(64);
});

/*
 * This token is the only thing standing between "the lab says this is Ana" and
 * a stranger writing into Ana's record. It is small and hand-rolled, which is
 * the argument for testing the ways it can be wrong rather than only the way it
 * is right.
 */
describe('the claim that identifies a learner to the lab', () => {
  it('round-trips the learner it was minted for', () => {
    assert.equal(readLabToken(mintLabToken(UID)), UID);
  });

  it('refuses a token whose payload was edited', () => {
    const token = mintLabToken(UID);
    const forged = token.replace(UID, '00000000-0000-0000-0000-000000000000');
    assert.equal(readLabToken(forged), null);
  });

  it('refuses a token whose signature was edited', () => {
    const token = mintLabToken(UID);
    const cut = token.lastIndexOf('.');
    assert.equal(readLabToken(`${token.slice(0, cut)}.AAAAAAAA`), null);
  });

  it('refuses an unsigned payload', () => {
    assert.equal(readLabToken(`${UID}.99999999999`), null);
  });

  it('refuses nothing at all', () => {
    assert.equal(readLabToken(null), null);
    assert.equal(readLabToken(''), null);
    assert.equal(readLabToken('....'), null);
  });

  /*
   * The expiry is what makes a leaked link stop mattering the same day. A check
   * that never fires is the same as no expiry, and nothing else here would
   * notice.
   */
  it('refuses a token past its expiry', () => {
    const minted = Date.now();
    const later = minted + (LAB_TOKEN_TTL_SECONDS + 60) * 1000;
    assert.equal(readLabToken(mintLabToken(UID, minted), later), null);
  });

  it('accepts one just inside its expiry', () => {
    const minted = Date.now();
    const later = minted + (LAB_TOKEN_TTL_SECONDS - 60) * 1000;
    assert.equal(readLabToken(mintLabToken(UID, minted), later), UID);
  });

  /*
   * Signed with the deployment's own secret, so a token from one environment is
   * worthless in another. Staging must not be able to write into production's
   * records.
   */
  it('refuses a token signed with a different secret', () => {
    const token = mintLabToken(UID);
    const real = process.env.INGEST_SECRET;
    process.env.INGEST_SECRET = 'b'.repeat(64);
    try {
      assert.equal(readLabToken(token), null);
    } finally {
      process.env.INGEST_SECRET = real;
    }
  });

  it('survives a url round trip, so it can ride in a link', () => {
    const token = mintLabToken(UID);
    const url = new URL(`https://iajit.vercel.app/?t=${encodeURIComponent(token)}`);
    assert.equal(readLabToken(url.searchParams.get('t')), UID);
  });
});
