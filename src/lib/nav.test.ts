/**
 * Every link in the header goes somewhere.
 *
 * Two of them are anchors into the home page, and an anchor is a contract
 * between two files with nothing between them: rename a section's `id`, or move
 * that section into a component, and the link keeps rendering, keeps looking
 * clickable, and scrolls nowhere. On every page, since this is the layout.
 *
 * Cheap to check because both halves are literals. Worth checking because the
 * failure is invisible in review — the diff that breaks it touches the page, not
 * the nav.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

const layout = readFileSync(path.join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
const home = readFileSync(path.join(ROOT, 'src', 'app', 'page.tsx'), 'utf8');

const links = [...layout.matchAll(/href: '([^']+)'/g)].map((m) => m[1]!);

describe('the header links', () => {
  it('found the nav, so the checks below mean something', () => {
    assert.ok(links.length >= 4, `only ${links.length} nav links parsed from the layout`);
  });

  for (const href of links) {
    it(`${href} resolves`, () => {
      if (href.startsWith('/#')) {
        const id = href.slice(2);
        assert.ok(
          home.includes(`id="${id}"`),
          `the header links to ${href} and the home page has no element with id="${id}", ` +
            `so the link scrolls nowhere from every page on the site`,
        );
        return;
      }

      // A route is a directory with a page under src/app.
      const dir = path.join(ROOT, 'src', 'app', href.replace(/^\//, ''));
      const files = (() => {
        try {
          return readdirSync(dir);
        } catch {
          return [];
        }
      })();
      assert.ok(
        files.some((f) => /^page\.tsx?$/.test(f)),
        `the header links to ${href} and there is no page at src/app${href}`,
      );
    });
  }
});

/*
 * The floating contact is not in the classroom.
 *
 * A green circle in the bottom-right of a phone is where a thumb rests, and on
 * `/coach` a tap there does not open a chat beside the lesson: it leaves the
 * page, `pagehide` fires, `reportUsage` closes the session, and the class is
 * over. An accidental tap costs a learner their class and the minutes it used.
 *
 * Pinned because the button lives in the root layout, which is the natural place
 * for it and the reason it reached a page it should not be on. Somebody
 * simplifying that component back to a server component would take the guard
 * with it and nothing would look wrong.
 */
describe('the floating WhatsApp button', () => {
  const source = readFileSync(
    path.join(import.meta.dirname, '..', 'components', 'WhatsAppButton.tsx'),
    'utf8',
  );

  it('hides itself on the page where a tap ends a class', () => {
    assert.match(
      source,
      /pathname\?*\.?startsWith\('\/coach'\)/,
      'the contact button no longer hides on /coach, where tapping it ends the session',
    );
  });

  it('returns nothing there rather than hiding with a class', () => {
    // `hidden` would still be tabbable and still be a target for a mistap on a
    // browser that ignores the class. Rendering nothing is the whole fix.
    assert.match(source, /return null;/, 'it must render nothing on /coach, not merely be invisible');
  });
});

/*
 * Nothing in the header invites a learner out of a running class.
 *
 * "Empezar la clase" sat in the sticky header on every page, `/coach` included.
 * A learner mid-class read a pulsing button offering to start the thing they
 * were doing, and tapping it navigated to the page they were already on: React
 * remounts, `pagehide` fires, the session closes, and the class ends.
 *
 * Same fault as the floating contact button and more prominent, because this one
 * is styled to be pressed and animated to catch the eye. Both live in the root
 * layout, which is the correct home for a header and the reason both reached a
 * page they should not be on.
 */
describe('the header call to action', () => {
  const source = readFileSync(
    path.join(import.meta.dirname, '..', 'components', 'StartClassLink.tsx'),
    'utf8',
  );

  it('is absent from the classroom', () => {
    assert.match(
      source,
      /pathname\?*\.?startsWith\('\/coach'\)/,
      'the header still offers to start a class on the page where one is running',
    );
    assert.match(source, /return null;/, 'it must render nothing there, not merely be hidden');
  });

  it('is what the layout renders, so the guard cannot be bypassed', () => {
    const layout = readFileSync(
      path.join(import.meta.dirname, '..', 'app', 'layout.tsx'),
      'utf8',
    );
    assert.match(layout, /<StartClassLink \/>/, 'the layout no longer uses the guarded component');
    assert.doesNotMatch(
      layout,
      /href="\/coach"[\s\S]{0,200}Empezar/,
      'the layout links to /coach with its own markup again, so the guard is bypassed',
    );
  });
});
