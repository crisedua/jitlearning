/**
 * Whether the live agent is the one this repo describes.
 *
 * Every mismatch here fails silently, after somebody edits the agent in the
 * ElevenLabs dashboard, with every other check still green. The doctor and
 * /admin/estado both ask this and each had grown its own arithmetic for it,
 * which is two definitions of "right".
 */
import assert from 'node:assert/strict';
import { CLASS_CAP_SECONDS } from './class-length';
import { describe, it } from 'node:test';
import { parity, type LiveAgent } from './parity';
import {
  dataCollection,
  dynamicVariablePlaceholders,
  evaluationCriteria,
  ragConfig,
  teacherSystemPrompt,
} from './agent';

/** An agent that matches the repo in every respect. */
const healthy = (search: boolean): LiveAgent => ({
  prompt: {
    prompt: teacherSystemPrompt({ search }),
    tool_ids: search ? ['tool_1'] : [],
    rag: { ...ragConfig(), enabled: true },
  },
  dynamicVariables: dynamicVariablePlaceholders(),
  platform_settings: {
    data_collection: dataCollection(),
    evaluation: { criteria: evaluationCriteria().map((c) => ({ id: c.id })) },
  },
});

describe('agent parity', () => {
  it('finds nothing wrong with an agent that matches, either way round', () => {
    for (const search of [true, false]) {
      const p = parity(healthy(search));
      assert.equal(p.persona, 'match');
      assert.deepEqual(p.missingVariables, []);
      assert.deepEqual(p.missingFields, []);
      assert.deepEqual(p.missingCriteria, []);
      assert.deepEqual(p.retrieval.drift, []);
      assert.equal(p.retrieval.enabled, true);
    }
  });

  /*
   * The two directions are different bugs and read differently to whoever fixes
   * them. Over-promising is the loud one: the teacher announces a search it
   * cannot run. Under-promising errors nowhere — a tool sits attached and the
   * teacher declines to use it, to everybody, until somebody notices.
   */
  it('names both directions of a persona mismatch', () => {
    const overPromising: LiveAgent = {
      ...healthy(false),
      prompt: { ...healthy(false).prompt, prompt: teacherSystemPrompt({ search: true }) },
    };
    assert.equal(parity(overPromising).persona, 'over-promises');

    const underPromising: LiveAgent = {
      ...healthy(true),
      prompt: { ...healthy(true).prompt, prompt: teacherSystemPrompt({ search: false }) },
    };
    assert.equal(parity(underPromising).persona, 'under-promises');
  });

  it('separates an edited prompt from an absent one', () => {
    assert.equal(parity({ prompt: { prompt: 'algo que nadie escribió aquí' } }).persona, 'foreign');
    assert.equal(parity({}).persona, 'empty');
    assert.equal(parity({ prompt: { prompt: '   ' } }).persona, 'empty');
  });

  /*
   * The dynamic variables sit beside `prompt` on the agent rather than inside
   * it. Reading them from the wrong place returns undefined, which reads as
   * "none declared" — and that is not a degraded feature, it is every
   * conversation failing outright. The first version of this module did exactly
   * that and reported three missing on an agent carrying all three.
   */
  it('reads the placeholders from where they actually live', () => {
    const p = parity({ ...healthy(false), dynamicVariables: undefined });
    assert.deepEqual(p.missingVariables, Object.keys(dynamicVariablePlaceholders()));

    const ok = parity(healthy(false));
    assert.deepEqual(ok.missingVariables, []);
  });

  it('names what is missing rather than counting it', () => {
    const stripped = healthy(false);
    const fields = { ...dataCollection() };
    delete (fields as Record<string, unknown>).commitment;
    const p = parity({ ...stripped, platform_settings: { ...stripped.platform_settings, data_collection: fields } });
    assert.deepEqual(p.missingFields, ['commitment']);
  });

  it('reports retrieval turned off separately from retrieval tuned differently', () => {
    const off = healthy(false);
    const offAgent: LiveAgent = { ...off, prompt: { ...off.prompt, rag: { ...ragConfig(), enabled: false } } };
    assert.equal(parity(offAgent).retrieval.enabled, false);
    assert.deepEqual(parity(offAgent).retrieval.drift, [], 'off is not the same as drifted');

    const tight = healthy(false);
    const tightAgent: LiveAgent = {
      ...tight,
      prompt: { ...tight.prompt, rag: { ...ragConfig(), enabled: true, max_vector_distance: 0.4 } },
    };
    assert.match(parity(tightAgent).retrieval.drift.join(' '), /relevance gate 0\.4/);
  });
});

/*
 * The ceiling is a copy the agent holds, like the persona and the extraction
 * fields, and drifts the same way. It matters more than most: the classroom's
 * wrap-up prompts, the teacher's pacing and the note above the start button all
 * take their timing from the repo's figure, so an agent that cuts sooner puts
 * every one of them past the end of the call — which is exactly the state this
 * repo was in, undetected, until the number was read off the live agent.
 */
describe('how long the live agent lets a class run', () => {
  it('says nothing when the two agree', () => {
    assert.equal(parity({ ...healthy(true), conversation: { max_duration_seconds: CLASS_CAP_SECONDS } }).liveClassCapSeconds, null);
  });

  it('reports the live figure when it differs', () => {
    const p = parity({ ...healthy(true), conversation: { max_duration_seconds: 300 } });
    assert.equal(p.liveClassCapSeconds, 300);
  });

  it('treats an unset ceiling as agreement, because the sync will set it', () => {
    assert.equal(parity({ ...healthy(true), conversation: {} }).liveClassCapSeconds, null);
    assert.equal(parity(healthy(true)).liveClassCapSeconds, null);
  });

  it('notices a longer one too, not just a shorter one', () => {
    // A ceiling above the repo's does not truncate the class, but it does mean
    // the two disagree, and the next person to read either one is misled.
    assert.equal(parity({ ...healthy(true), conversation: { max_duration_seconds: 1800 } }).liveClassCapSeconds, 1800);
  });
});

/*
 * The persona variant is chosen from whether any tool is attached, which
 * identifies the search tool only while it is the only tool. A second one —
 * skip_turn, say — would make this read as "can search" and push the persona
 * that promises lookups onto an agent that cannot perform them.
 */
describe('how many tools the agent carries', () => {
  it('counts them, so the inference can be questioned', () => {
    assert.equal(parity({ ...healthy(true), prompt: { prompt: 'x', tool_ids: ['a'] } }).toolCount, 1);
    assert.equal(
      parity({ ...healthy(true), prompt: { prompt: 'x', tool_ids: ['a', 'b'] } }).toolCount,
      2,
    );
  });

  it('reports none when there are none', () => {
    assert.equal(parity(healthy(false)).toolCount, 0);
  });
});
