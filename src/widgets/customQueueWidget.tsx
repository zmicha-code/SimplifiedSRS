import { usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents, BuiltInPowerupCodes, useTracker
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
//import { getLastInterval, getWrongInRow, formatMilliseconds } from ''
import MyRemNoteButton from '../components/MyRemNoteButton';
import { format } from 'path';

// -> AbstractionAndInheritance
export const specialNames = ["Collapse Tag Configure Options", "Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Aliases", "Bullet Icon"]; // , "Definition", "Eigenschaften"

export const specialNameParts = ["query:", "contains:"];

// -> index
// Constants for time in milliseconds
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DEFAULT_AGAIN = 30 * MS_PER_MINUTE;
const DEFAULT_HARD = 12 * MS_PER_HOUR;
const DEFAULT_GOOD = 2 * MS_PER_DAY;
const DEFAULT_EASY = 4 * MS_PER_DAY;

// -> AbstractionAndInheritance
async function isReferencingRem(plugin: RNPlugin, rem: Rem): Promise<boolean> {
    if(rem)
    return (await rem.remsBeingReferenced()).length != 0;

    return false;
}

// -> AbstractionAndInheritance
async function processRichText(plugin: RNPlugin, richText: RichTextInterface, showAlias = false): Promise<string> {
    const textPartsPromises = richText.map(async (item) => {
    if (typeof item === "string") {
    return item;
    }
    switch (item.i) {
    case 'm': return item.text;
    case 'q':
    const id = showAlias && item.aliasId ? item.aliasId : item._id;
    
    const referencedRem = await plugin.rem.findOne(id);
    if (referencedRem) {
        return await getRemText(plugin, referencedRem);
    } else if (item.textOfDeletedRem) {
        return await processRichText(plugin, item.textOfDeletedRem);
    }
    return "";
    case 'i': return item.url;
    case 'a': return item.url;
    case 'p': return item.url;
    case 'g': return item._id || "";
    case 'x': return item.text;
    case 'n': return item.text;
    case 's': return "";
    default: return "";
    }
    });

    const textParts = await Promise.all(textPartsPromises);
    return textParts.join("");
}

// -> AbstractionAndInheritance
async function getRemText(plugin: RNPlugin, rem: Rem | undefined, extentedName = false): Promise<string> {
    if (!rem) return "";

    let richText = rem.text;

    // Special case, where text of rem only consists of a reference.
    // q: Ref
    // m: Link
    if(richText && richText.length == 1 && (richText[0].i == 'q' || richText[0].i == 'm')) {

      let propertyText = "";

      if(richText[0].i == 'q') {
        const referencedRem = await plugin.rem.findOne(richText[0]._id);
        propertyText = await getRemText(plugin, referencedRem)
      }

      if(richText[0].i == 'm') {
        propertyText = richText[0].text;
      }

      const parentRem =  rem.getParentRem ? await rem.getParentRem() : await (await plugin.rem.findOne(rem._id))?.getParentRem(); // await rem.getParentRem() -> "getParentRem is not a function"
      const parentText = parentRem ? await getRemText(plugin, parentRem) : "";

      return parentText + " > " + propertyText;
    }

    const textPartsPromises = richText ? richText.map(async (item) => {
    if (typeof item === "string") {
      if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
        const parentRem = await rem.getParentRem();

        if(parentRem)
            return await getRemText(plugin, parentRem) + ">" + item;
      }
      return item;
    }

    switch (item.i) {
    case 'q':
      const referencedRem = await plugin.rem.findOne(item._id);
      if (referencedRem) {
          if(extentedName) {
          const refParentRem = await rem.getParentRem();

          if(refParentRem)
              return await getRemText(plugin, refParentRem, true) + ">" + await getRemText(plugin, referencedRem);
          }

          return await getRemText(plugin, referencedRem);
      } else if (item.textOfDeletedRem) {
          return await processRichText(plugin, item.textOfDeletedRem);
      }
      return "";
    case 'i': return item.url;
    case 'a': return item.url;
    case 'p': return item.url;
    case 'g': return item._id || "";
    case 'm':
    case 'x': 
    case 'n':
      if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
          const parentRem = await rem.getParentRem();

          if(parentRem)
              return await getRemText(plugin, parentRem) + ">" + item.text;
      }
      return item.text;
      case 's': return "";
      default: return "";
    }
    }) : [];

    const textParts = await Promise.all(textPartsPromises);

    if(rem.isSlot && await rem.isSlot())
        return await getRemText(plugin, await rem.getParentRem()) + " > " + textParts.join("");
    else
        return textParts.join("");
}

// -> AbstractionAndInheritance
async function getCleanChildren(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
    const childrenRems = await rem.getChildrenRem();
    const cleanChildren: Rem[] = [];
    for (const childRem of childrenRems) {
    const text = await getRemText(plugin, childRem);
    if (!specialNames.includes(text)) {
    cleanChildren.push(childRem);
    }
}
return cleanChildren;
}

// -> AbstractionAndInheritance
export async function getCleanChildrenAll(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  // Fetch direct children and referencing Rems
  const childrenRems = await rem.getChildrenRem();
  const referencingRems = await rem.remsReferencingThis();
  const allRems = [...childrenRems, ...referencingRems];

  // Remove duplicates based on Rem _id
  const uniqueRemsMap = new Map<string, Rem>();
  for (const r of allRems) {
    if (!uniqueRemsMap.has(r._id)) {
      uniqueRemsMap.set(r._id, r);
    }
  }
  const uniqueRems = Array.from(uniqueRemsMap.values());

  // Fetch texts concurrently for efficiency
  const texts = await Promise.all(uniqueRems.map(r => getRemText(plugin, r)));

  // Apply the same filtering as getCleanChildren
  const cleanRems: Rem[] = [];
  for (let i = 0; i < uniqueRems.length; i++) {
    const text = texts[i];
    if (
      !specialNames.includes(text) &&
      !specialNameParts.some(part => text.startsWith(part))
    ) {
      cleanRems.push(uniqueRems[i]);
    }
  }
  return cleanRems;
}

// -> AbstractionAndInheritance
export async function getAncestorLineage(plugin: RNPlugin, rem: Rem): Promise<Rem[][]> {
  const lineages = await findPaths(plugin, rem, [rem]);
  return lineages;
}

async function findPaths(plugin: RNPlugin, currentRem: Rem, currentPath: Rem[]): Promise<Rem[][]> {
  const parents = (await getParentClassType(plugin, currentRem)) || [];

  if (parents.length === 1 && parents[0]._id === currentRem._id) {
    return [currentPath];
  } else {
    const allPaths: Rem[][] = [];
    for (const parent of parents) {
      if (!currentPath.some(r => r._id === parent._id)) {
        const parentPaths = await findPaths(plugin, parent, [...currentPath, parent]);
        allPaths.push(...parentPaths);
      }
    }
    return allPaths;
  }
}

// Function to get the closest class parent for a Rem
export async function getParentClassType(plugin: RNPlugin, rem: Rem): Promise<Rem[] | null> {
  if (!rem) return null;

  const parent = await rem.getParentRem();
  const type = await rem.getType();
  const isReferencing = await isReferencingRem(plugin, rem);
  const isDocument = await rem.isDocument();
  const isSlot = await rem.isSlot();
  const tags = await getCleanTags(plugin, rem);

  // DOCUMENT with TAGS. This should never happen. A DOCUMENT should always define a new type and therefore have no parents through tags.
  if (isDocument && tags.length > 0) {
    await plugin.app.toast('Mistake: DOCUMENT with TAG. (' + await getRemText(plugin, rem) + ")");
    //return tags[0];
    return null;
  } 

  // DOCUMENT without TAGS. Defines a new Type. Has no other parent Type
  if (isDocument)
    return [rem];

  // SLOT with TAG.
  // NEW: We dont use TAGS for inheritance any more
  if(isSlot && tags.length > 0) {
    await plugin.app.toast('Mistake: SLOT with TAG. (' + await getRemText(plugin, rem) + ")");
    //return [tags[0]];
    return null
  }

  if(isSlot && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];
    return [referencedRem]
  }

  // SLOT without TAG: Property of new Type
  if(isSlot) {
    //await plugin.app.toast('Mistake: SLOT without TAG.' + (await getRemText(plugin, rem)) + ")");
    return [rem];
  }

  // CONCEPT, DOCUMENT, without TAGS
  // Case already covered with isDocument
  //if(type === RemType.CONCEPT && isDocument && tags.length == 0) {
  //  return rem;
  //}

  // CONCEPT with TAGS
  // OLD: Inherits Type from TAG
  // NEW: Inheritance no longer through TAGS but with REFS like in the case of DESCRIPTORS instead
  if (type === RemType.CONCEPT && tags.length > 0) {
    await plugin.app.toast('Mistake: CONCEPT with TAG. (' + await getRemText(plugin, rem) + ")");
    return [tags[0]];
  } 

  // Inherits Type from REF
  if(type === RemType.CONCEPT && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];

    if(parent && await isSameBaseType(plugin, referencedRem, parent))
      return [parent, referencedRem]

    return [referencedRem];
  }
  
  // Concept, without TAGS
  // Inherits Type from Rem Parent
  if (type === RemType.CONCEPT && tags.length == 0) {

      if(!parent) return [rem]; // || await getRemText(plugin, parent) == "Eigenschaften" || await getRemText(plugin, parent) == "Definition"

      return [parent];
  } 

  // DESCRIPTOR with TAG. Should this happen? Cant think of a usecase
  if(type == RemType.DESCRIPTOR && !isReferencing && tags.length > 0) {
    //await plugin.app.toast('Potential Mistake: DESCRIPTOR with TAG.');
    //return [tags[0]];

    if(!parent) return null;

    return [parent];
}

  // DESCRIPTOR without TAG
  // Defines an interface with the type of the parent rem
  if(type == RemType.DESCRIPTOR && !isReferencing && tags.length == 0) {
    // Soon deprecated
    if(!parent) return null; // || await getRemText(plugin, parent) == "Eigenschaften" || await getRemText(plugin, parent) == "Definition"

    return [parent];
  }

  // REF DESCRIPTOR with TAG
  // TODO?

  // REF DESCRIPTOR without TAG
  // Implements a layer with type of reference
  if (type === RemType.DESCRIPTOR && isReferencing) {
      const referencedRem = (await rem.remsBeingReferenced())[0];

      const referencedClass = referencedRem; //await getParentClassType(plugin, referencedRem);

      if(await referencedRem.isDocument()) {
        //console.log("Referenced Rem is document");

        return [referencedClass];
      }

      // Special case (Interface implementation/Same Type): referenced Rem's parent is an ancestor of descriptor's parent
      // TODO: Multiple lineages?
      if (referencedClass && parent && await isSameBaseType(plugin, referencedClass, parent)) { // await isClassAncestor(plugin, referencedClass, parent)

        // TODO:

        //console.log("We are here");

        return [parent, referencedClass];
      } else {
        // Inherit from the referenced Rem's class type
        //return getClassType(plugin, referencedRem);

        //console.log("REF DESCRIPTOR " + await getRemText(plugin, rem) + " is of type " + await getRemText(plugin, referencedRem));

        return [referencedRem];
      }
  }

  return null; // Default case, though should be handled above
} 

export async function getBaseType(plugin: RNPlugin, rem: Rem): Promise<Rem> {
  // Retrieve all ancestor lineages
  const lineages = await getAncestorLineage(plugin, rem);
  
  // If there are no ancestors, the base type is the rem itself
  if (!lineages || lineages.length === 0) {
    return rem;
  }

  // Choose the first lineage (primary path) and take its last element
  const primaryLineage = lineages[0];
  if (primaryLineage.length === 0) {
    return rem;
  }

  return primaryLineage[primaryLineage.length - 1];
}

export async function isSameBaseType(
  plugin: RNPlugin,
  rem1: Rem,
  rem2: Rem
): Promise<boolean> {
  const [base1, base2] = await Promise.all([
    getBaseType(plugin, rem1),
    getBaseType(plugin, rem2),
  ]);

  return base1._id === base2._id;
}

export const specialTags = ["Document", "Template Slot", "Tag", "Tags", "Header", "Deck", "Flashcards", "Rem With An Alias", "Automatically Sort", "Document", "Highlight", "Hide Bullets", "Status"];

export async function getCleanTags(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const tagRems = await rem.getTagRems();
  const cleanTags: Rem[] = [];
  for (const tagRem of tagRems) {
    const text = await getRemText(plugin, tagRem);
    if (!specialTags.includes(text)) {
      cleanTags.push(tagRem);
    }
  }
  return cleanTags;
}

// -> index.tsx
function formatMilliseconds(ms : number, abs = false): string {
  let isNegative = false;

  if (ms === 0) return 'New Card'; // Special case for zero // "0 seconds"
  if (ms < 0) {
    isNegative = true;
    ms = Math.abs(ms);    // Handle negatives with absolute value
  }

  const millisecondsInSecond = 1000;
  const millisecondsInMinute = millisecondsInSecond * 60;
  const millisecondsInHour = millisecondsInMinute * 60;
  const millisecondsInDay = millisecondsInHour * 24;

  let value, unit;

  if (ms >= millisecondsInDay) {
      value = ms / millisecondsInDay;
      unit = 'day';
  } else if (ms >= millisecondsInHour) {
      value = ms / millisecondsInHour;
      unit = 'hour';
  } else if (ms >= millisecondsInMinute) {
      value = ms / millisecondsInMinute;
      unit = 'minute';
  } else if (ms >= millisecondsInSecond) {
      value = ms / millisecondsInSecond;
      unit = 'second';
  } else {
      value = ms;
      unit = 'millisecond';
  }

  // Round to 2 decimal places for clean output
  value = Math.round(value * 100) / 100;

  // Pluralize unit if value isn’t 1
  const plural = value !== 1 ? 's' : '';
  //return `${value} ${unit}${plural}`;
  return (isNegative && !abs ? "-" : "") + value + " " + unit + plural;
}

async function getCardsOfRemUp(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()) {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: Card[] = [];

    const lineages = await getAncestorLineage(plugin, rem);

    for(const l of lineages) {
      for(const a of l) {
        const ancestorCards = await getCardsOfRemDown(plugin, a, processed, addedCardIds);
        cards = cards.concat(ancestorCards);
      }
    }

    return cards;
}

async function isFlashcard(plugin: RNPlugin, rem: Rem): Promise <boolean> {

  const children = await getCleanChildren(plugin, rem);

  for(const c of children) {
    if(await c.isCardItem())
      return true;
  }

  return false;
}

async function getCardsOfRemDown(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()) {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: Card[] = [];

    const remCards = await rem.getCards();

    //cards = cards.concat(remCards);
    for(const c of remCards) {
      if (!addedCardIds.has(c._id)) {
        addedCardIds.add(c._id);
        cards.push(c);
      }
    }
    
    const childrenRem = await getCleanChildrenAll(plugin, rem);

    //
    for(const c of childrenRem) {
      const refs = await c.remsBeingReferenced();

      // A Reference to another Flashcard appears in the Answer of a Flashcard
      if (refs.length > 0 && (await c.isCardItem() || await c.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) { // 
        const ref= refs[0];

        // If the Ref is a Flashcard, add it.
        if((await ref.getCards()).length > 0) {
          //const isQuestionInCards = cards.some(card => card.remId === ref._id);
          //if (!isQuestionInCards) {
          //    const questionCards = await ref.getCards();
          //    cards = cards.concat(questionCards);
          //}
          const questionCards = await ref.getCards();

          for(const c of questionCards) {
            if (!addedCardIds.has(c._id)) {
              addedCardIds.add(c._id);
              cards.push(c);
            }
          }
        }
      }

      // TODO: What to do if the Ref is a Concept?
    }

    const childrenRef = await rem.remsReferencingThis();

    // Check for Questions where the current Question appears as an Answer.
    for (const r of childrenRef) {
        if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
            const question = await r.getParentRem();
            if (question) {
                const questionId = question._id;
                //const isQuestionInCards = cards.some(card => card.remId === questionId);
                //if (!isQuestionInCards) {
                //    const questionCards = await question.getCards();
                //    cards = cards.concat(questionCards);
                //}
                const questionCards = await question.getCards();

                for(const c of questionCards) {
                  if (!addedCardIds.has(c._id)) {
                    addedCardIds.add(c._id);
                    cards.push(c);
                  }
                }
            }
        }
    }

    const children = [...childrenRem, ...childrenRef];

    for (const child of children) {
      const childCards = await getCardsOfRemDown(plugin, child, processed, addedCardIds);
      cards = cards.concat(childCards);
    }

    return cards;
}

async function getCardsOfRemUpDue(plugin: RNPlugin, rem: Rem): Promise<Card[]> {
  const allCards = await getCardsOfRemUp(plugin, rem);

  // There are cards where this doesnt work.
  //const dueCards = allCards.filter(card => {
  //  return card.nextRepetitionTime === undefined || 
  //         (typeof card.nextRepetitionTime === 'number' && card.nextRepetitionTime <= Date.now());
  //});

  const dueCards = allCards.filter(card => {
    const lastInterval = getLastInterval(card?.repetitionHistory);
    return lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() < 0 : true;
  });

  //console.log("dueCards: " + dueCards.length);
  return dueCards;
}

async function getCardsOfRemDownDue(plugin: RNPlugin, rem: Rem): Promise<Card[]> {
  const allCards = await getCardsOfRemDown(plugin, rem);

  // There are cards where this doesnt work.
  //const dueCards = allCards.filter(card => {
  //  return card.nextRepetitionTime === undefined || 
  //         (typeof card.nextRepetitionTime === 'number' && card.nextRepetitionTime <= Date.now());
  //});

  const dueCards = allCards.filter(card => {
    const lastInterval = getLastInterval(card?.repetitionHistory);
    return lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() < 0 : true;
  });

  //console.log("dueCards: " + dueCards.length);
  return dueCards;
}

async function getCardsOfRemUpDisabled(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()): Promise<{ id: string, text: string, nextDate: number }[]> {
    if (processed.has(rem._id)) {
        return [];
    }
    processed.add(rem._id);

    let cards: { id: string, text: string, nextDate: number }[] = [];
    
    const childrenRem = await getCleanChildrenAll(plugin, rem);

    // Check Children for Disabled Flashcards
    for(const c of childrenRem) {
      //console.log(name + ": Direction" + await c.getEnablePractice())
      if(!(await c.getEnablePractice()) && await isFlashcard(plugin, c)) {
        //console.log("Adding " + name + "(" + c._id + ")");
        if (!addedCardIds.has(c._id)) {
          addedCardIds.add(c._id);

          const name = await getRemText(plugin, c);
          cards.push({ id: c._id, text: name, nextDate: 0 });
        }
      } else {
        //console.log(name + " has no PowerUp.DisableCards");
      }
    }

    //
    const childrenRef = await rem.remsReferencingThis();

    // Check for Questions where the current Question appears as an Answer.
    for (const r of childrenRef) {
      if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
          const question = await r.getParentRem();
          if (question && !(await question.getEnablePractice())) {
            if (!addedCardIds.has(question._id)) {
              addedCardIds.add(question._id);
              cards.push({id: question._id, text: await getRemText(plugin, question), nextDate: 0});
            } 
          }
      }
    }

    //const children = [...childrenRem, ...childrenRef];
    //for (const child of children) {
    //  const childCards = await getCardsOfRemDown(plugin, child, processed, addedCardIds);
    //  cards = cards.concat(childCards);
    //}

    const lineages = await getAncestorLineage(plugin, rem);

    for(const l of lineages) {
      for(const a of l) {
        const ancestorCards = await getCardsOfRemDownDisabled(plugin, a, processed, addedCardIds);
        cards = cards.concat(ancestorCards);
      }
    }

    return cards;
}

async function getCardsOfRemDownDisabled(plugin: RNPlugin, rem: Rem, processed = new Set(), addedCardIds = new Set()): Promise<{ id: string, text: string, nextDate: number }[]> {
  if (processed.has(rem._id)) {
        return [];
    }
  processed.add(rem._id);

  let cards: { id: string, text: string, nextDate: number }[] = [];

  //
  const childrenRem = await getCleanChildrenAll(plugin, rem);

  // Check Children for Disabled Flashcards
  for(const c of childrenRem) {
    //console.log(name + ": Direction" + await c.getEnablePractice())
    if(!(await c.getEnablePractice()) && await isFlashcard(plugin, c)) {
      //console.log("Adding " + name + "(" + c._id + ")");
      if (!addedCardIds.has(c._id)) {
        addedCardIds.add(c._id);

        const name = await getRemText(plugin, c);
        cards.push({ id: c._id, text: name, nextDate: 0 });
      }
    } else {
      //console.log(name + " has no PowerUp.DisableCards");
    }
  }

  // A Reference to another Question appears in the Answer of a Flashcard
  for(const c of childrenRem) {
    const refs = await c.remsBeingReferenced();

    if (refs.length > 0 && (await c.isCardItem() || await c.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) { // 
      const ref = refs[0];

      // If the Ref is a Disabled Flashcard, add it.
      if(!(await ref.getEnablePractice()) && await isFlashcard(plugin, c)) {

        if (!addedCardIds.has(ref._id)) {
          addedCardIds.add(ref._id);
          const name = await getRemText(plugin, ref);
          cards.push({id: ref._id, text: name, nextDate: 0});
        }
      }

      // TODO: What to do if the Ref is a Concept?
    }
  }

  //
  const childrenRef = await rem.remsReferencingThis();

  // Check for Questions where the current Question appears as an Answer.
  for (const r of childrenRef) {
    if (await r.isCardItem() || await r.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) { // 
        const question = await r.getParentRem();
        if (question && !(await question.getEnablePractice())) {
          if (!addedCardIds.has(question._id)) {
            addedCardIds.add(question._id);
            cards.push({id: question._id, text: await getRemText(plugin, question), nextDate: 0});
          } 
        }
    }
  }

  // Recursion
  const children = [...childrenRem, ...childrenRef];
  for (const c of children) {
    const childCards = await getCardsOfRemDownDisabled(plugin, c, processed, addedCardIds);
    cards = cards.concat(childCards);
  }

  return cards;
}

async function loadCards(plugin: RNPlugin, rem: Rem | undefined, cardIds: string[]): Promise<Card[]> {
    if(!rem)
        return [];

    const allCards = await getCardsOfRemDown(plugin, rem);
    const cardIdSet = new Set(cardIds);
    const filteredCards = allCards.filter(card => cardIdSet.has(card._id));
    return filteredCards;
}

function getLastRatingStr(history: RepetitionStatus[] | undefined): string {
  // Handle undefined or empty array
  if (!history || history.length === 0) {
      return "";
  }

  // Iterate from the last element to the first
  for (let i = history.length - 1; i >= 0; i--) {
      const score = history[i].score;
      // Skip TOO_EARLY and VIEWED_AS_LEECH
      if (score !== QueueInteractionScore.TOO_EARLY && score !== QueueInteractionScore.VIEWED_AS_LEECH) {
          switch (score) {
              case QueueInteractionScore.AGAIN:
                  return "Forgot";
              case QueueInteractionScore.HARD:
                  return "Partially recalled";
              case QueueInteractionScore.GOOD:
                  return "Recalled with effort";
              case QueueInteractionScore.EASY:
                  return "Easily recalled";
              case QueueInteractionScore.RESET:
                  return "Reset";
              default:
                  // Handle unexpected scores (though unlikely with enum)
                  return "";
          }
      }
  }

  // Return empty string if all scores are TOO_EARLY or VIEWED_AS_LEECH
  return "";
}

export function getLastInterval(history: RepetitionStatus[] | undefined): {workingInterval: number, intervalSetOn: number} | undefined {
  if (!history || history.length === 0) {
      return undefined;
  }

  for (let i = history.length - 1; i >= 0; i--) {
      const repetition = history[i];
      if (repetition.pluginData && typeof repetition.pluginData.workingInterval === 'number' && typeof repetition.pluginData.intervalSetOn === 'number') {
          return { workingInterval: repetition.pluginData.workingInterval , intervalSetOn: repetition.pluginData.intervalSetOn};
      }
  }

  return undefined;
}

async function questionsFromCards_(plugin: RNPlugin, cards: Card[]): Promise<string[]> {
  let questions: string[] = [];

  for(const c of cards) {
    questions.push(await getRemText(plugin, await c.getRem()));
  }

  return questions;
}

// Updated to return an array of { id, text } objects
async function questionsFromCards(plugin: RNPlugin, cards: Card[]): Promise<{ id: string, text: string, nextDate: number }[]> {
    const questions: { id: string, text: string, nextDate: number }[] = [];
    for (const c of cards) {
        const rem = await c.getRem();
        const text = rem ? await getRemText(plugin, rem) : '';

        const lastInterval = getLastInterval(c.repetitionHistory);
        questions.push({ id: rem ? rem._id : c._id, text, nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0});
    }
    return questions;
}

/*
function CustomQueueWidget_() {
    const plugin = usePlugin();
    const [focusedRem, setFocusedRem] = useState<Rem | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [cards, setCards] = useState<Card[]>([]);
    const [currentCardId, setCurrentCardId] = useState<string | undefined>(undefined);
    const [currentCardText, setCurrentCardText] = useState<string>("");
    const [currentCardLastInterval, setCurrentCardLastInterval] = useState<string>("");
    const [currentCardRepetitionTiming, setcurrentCardRepetitionTiming] = useState<number>(0);
    const [currentCardLastRating, setcurrentCardLastRating] = useState<string>("");
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const [focusedRemText, setFocusedRemText] = useState<string>("");

    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    const [cardsStr, setCardsStr] = useState<string[]>([]);
  
    // Load persisted state on mount
    useEffect(() => {
      const initFromStorage = async () => {
        const currentQueueRemId: string | undefined = await plugin.storage.getSynced("currentQueueRemId");
        const currentQueueCardIds: string[] = (await plugin.storage.getSynced("currentQueueCardIds")) || [];
        if (currentQueueRemId && currentQueueCardIds.length > 0) {
          const rem = await plugin.rem.findOne(currentQueueRemId);
          if (rem) {
            setFocusedRem(rem);
            setCardIds(currentQueueCardIds);
            const loadedCards = await loadCards(plugin, rem, currentQueueCardIds);
            setCards(loadedCards);
            //
            setCardsStr(await questionsFromCards(plugin, loadedCards));
            
            // Card Info Panel
            updateCardInfo();
          }
        }
      };
      initFromStorage();
    }, [plugin]);

    // Event listener for card updates
    useEffect(() => {
      const handleQueueLoadCard = async (event: any) => {
    
        updateCardInfo(event.cardId);
      };
  
      plugin.event.addListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
      return () => {
        plugin.event.removeListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
      };
    }, [plugin]);

    // Update focusedRem text
    useEffect(() => {
        const updateRemText = async () => {
          if (focusedRem) {
            const text = await getRemText(plugin, focusedRem);
            setFocusedRemText(text);
          } else {
            setFocusedRemText("");
          }
        };
        updateRemText();
      }, [focusedRem]);
    
    const loadCurrentRemQueue = async () => {
        setLoading(true);
        const currentFocusedRem = await plugin.focus.getFocusedRem();

        if (currentFocusedRem) {
            const updateQueue = async () => {
            setLoading(true);
            const fetchedCards = await getCardsOfRem(plugin, currentFocusedRem);
            const ids = fetchedCards.map((c) => c._id);
            setCardIds(ids);
            setCards(fetchedCards);
            //
            setCardsStr(await questionsFromCards(plugin, fetchedCards));
            await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
            await plugin.storage.setSynced("currentQueueCardIds", ids);

            //await plugin.storage.setSynced("currentQueueCards", fetchedCards);

            setLoading(false);
            setFocusedRem(currentFocusedRem);
            setIsTableExpanded(false);
            };
            updateQueue();
        }
    };

    const loadCurrentRemQueueDue = async () => {
      setLoading(true);
      const currentFocusedRem = await plugin.focus.getFocusedRem();

      if (currentFocusedRem) {
          const updateQueue = async () => {
          setLoading(true);
          const fetchedCards = await getCardsOfRemDue(plugin, currentFocusedRem);
          const ids = fetchedCards.map((c) => c._id);
          setCardIds(ids);
          setCards(fetchedCards);
          //
          setCardsStr(await questionsFromCards(plugin, fetchedCards));
          await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
          await plugin.storage.setSynced("currentQueueCardIds", ids);

          setLoading(false);
          setFocusedRem(currentFocusedRem);
          setIsTableExpanded(false);
          };
          updateQueue();
      }
  };
  
    const updateCardInfo = async (cardId = undefined) => {
      const id = cardId ?? await plugin.storage.getSynced<string>("currentQueueCardId");
      if (id) {
        setCurrentCardId(id);
        const currentCard = await plugin.card.findOne(id);
        const rem = await currentCard?.getRem();

        //console.log("Current Card: " + await getRemText(plugin, rem));

        //const cardInterval = await plugin.storage.getSynced<number>("currentQueueCardInterval") ?? 0;
        const lastInterval = getLastInterval(currentCard?.repetitionHistory)

        setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
        setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
        setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory));
      }
    };

    async function onMouseClick() {
      updateCardInfo();
    }
  
    // Rest of your component (loadCurrentRemQueue, JSX, etc.) remains unchanged
    const openQueueRem = async () => {
      
        if (focusedRem) {
          await plugin.window.openRem(focusedRem);
        }
    };
  
    const openCurrentFlashcard = async () => {
        const currentCard = cards.find((card) => card._id === currentCardId);
        const rem = await currentCard?.getRem();
        if (rem) {
          await plugin.window.openRem(rem);
        }
    };
  
    const toggleTableExpansion = () => {
      setIsTableExpanded(!isTableExpanded);
      updateCardInfo();
    };

    const toogleCardList = () => {
      setIsListExpanded(!isListExpanded);
      //updateCardInfo();
    };
  
    return (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ paddingRight: "20px" }}>Current Queue: {focusedRemText || "No Rem selected"} <MyRemNoteButton text="" onClick={openQueueRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" /></div> 
          <div style={{ paddingRight: "20px" }}>Practice Flashcards from Rem: 
            <MyRemNoteButton text="All" onClick={loadCurrentRemQueue} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
            <MyRemNoteButton text="Due" onClick={loadCurrentRemQueueDue} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
          </div>
        </div>
        {loading ? (
          <div>Loading flashcards...</div>
        ) : cardIds.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", flex: "1", overflow: "auto" }}>
            <div style={{ marginTop: "10px" }}>
              <button onClick={toogleCardList} style={{ marginBottom: 10 }}>
                {isListExpanded ? "- Card List:" : "+ Card List: "}
              </button>
              {isListExpanded && (
                <div>
                  {cardsStr.map((c) => (
                    <div><MyRemNoteButton text={c} onClick={async () => {}}/></div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: "10px" }}>
              <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
                {isTableExpanded ? "- Card Information: " : "+ Card Information: "}{currentCardText}
              </button>
              <MyRemNoteButton text="" onClick={openCurrentFlashcard} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
              {isTableExpanded && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Date</th>
                      <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Interval</th>
                      <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: "1px solid #ddd", padding: 8 }}>
                        {currentCardRepetitionTiming == 0
                          ? ""
                          : currentCardRepetitionTiming < 0
                          ? "Late (" + formatMilliseconds(currentCardRepetitionTiming) + ")"
                          : "Early (" + formatMilliseconds(currentCardRepetitionTiming) + ")"}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastInterval}</td>
                      <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastRating}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <div onClick={onMouseClick} style={{ cursor: "pointer" }}>
              <Queue cardIds={cardIds} width={"100%"} maxWidth={"100%"} />
            </div>
          </div>
        ) : (
          <div>No cards to display. CardIds is empty: {JSON.stringify(cardIds)}</div>
        )}
      </div>
    );
}
*/

function CustomQueueWidget() {
    const plugin = usePlugin();
    const [focusedRem, setFocusedRem] = useState<Rem | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [cards, setCards] = useState<Card[]>([]);
    const [currentCardId, setCurrentCardId] = useState<string | undefined>(undefined);
    const [currentCardText, setCurrentCardText] = useState<string>("");
    const [currentCardLastInterval, setCurrentCardLastInterval] = useState<string>("");
    const [currentCardLastPractice, setCurrentCardLastPractice] = useState<string>("");
    const [currentCardRepetitionTiming, setcurrentCardRepetitionTiming] = useState<number>(0);
    const [currentCardLastRating, setcurrentCardLastRating] = useState<string>("");
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const [queueRemText, setQueueRemText] = useState<string>("");
    const [selectedRemText, setSelectedRemText] = useState<string>("");
    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    // Updated state type to array of objects
    const [cardsData, setCardsData] = useState<{ id: string, text: string , nextDate: number}[]>([]);
    const [sortAscending, setSortAscending] = useState<boolean>(true);

    //
    const [selectedOption, setSelectedOption] = useState('All');

    const currentRem = useTracker(async (reactPlugin) => {
            return await reactPlugin.focus.getFocusedRem();
        }
    );

    useEffect(() => {
        const initFromStorage = async () => {
            const currentQueueRemId: string | undefined = await plugin.storage.getSynced("currentQueueRemId");
            const currentQueueCardIds: string[] = (await plugin.storage.getSynced("currentQueueCardIds")) || [];
            if (currentQueueRemId && currentQueueCardIds.length > 0) {
                const rem = await plugin.rem.findOne(currentQueueRemId);
                if (rem) {
                    setFocusedRem(rem);
                    setCardIds(currentQueueCardIds);
                    const loadedCards = await loadCards(plugin, rem, currentQueueCardIds);
                    setCards(loadedCards);
                    setCardsData(await questionsFromCards(plugin, loadedCards));
                    updateCardInfo();
                }
            }
        };
        initFromStorage();
    }, [plugin]);

    useEffect(() => {
        const handleQueueLoadCard = async (event: any) => {
            updateCardInfo(event.cardId);
        };
        plugin.event.addListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        return () => {
            plugin.event.removeListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        };
    }, [plugin]);

    useEffect(() => {
        const updateRemText = async () => {
          //setFocusedRem(currentRem);

          if (focusedRem) {
              const text = await getRemText(plugin, focusedRem);
              setQueueRemText(text);
          } else {
            setQueueRemText("");
          }
        };
        updateRemText();
    }, [focusedRem]); // focusedRem

    useEffect(() => {
      const updateSelectedRemText = async () => {
        const txt = await getRemText(plugin, currentRem);
        setSelectedRemText(txt == "" ? "No Rem Selected" : txt);
      };
      updateSelectedRemText();
    }, [currentRem]); // focusedRem

    const loadRemQueue = async (setting: string) => {
      //console.log(await getRemText(plugin, focusedRem));

      setCardIds([]);
      setCards([]);
      setCardsData([]);
      setFocusedRem(undefined);
      setIsTableExpanded(false);
      //setLoading(true);
      const currentFocusedRem = currentRem; // focusedRem; //await plugin.focus.getFocusedRem();
      if (currentFocusedRem) {
          const updateQueue = async () => {
              setLoading(true);
              const text = await getRemText(plugin, currentFocusedRem);
              setQueueRemText(text);

              //const fetchedCards = await getCardsOfRemDown(plugin, currentFocusedRem);
              let fetchedCards: Card[] = [];
              if(setting == "SETTING_DOWN")
                fetchedCards = await getCardsOfRemDown(plugin, currentFocusedRem);

              if(setting == "SETTING_UP")
                fetchedCards = await getCardsOfRemUp(plugin, currentFocusedRem);

              const ids = fetchedCards.map((c) => c._id);
              setCardIds(ids);
              setCards(fetchedCards);
              setCardsData(await questionsFromCards(plugin, fetchedCards));
              await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
              await plugin.storage.setSynced("currentQueueCardIds", ids);
              setLoading(false);
              setFocusedRem(currentFocusedRem);
              setIsTableExpanded(false);
          };
          updateQueue();
      }
    };

    const loadRemQueueDue = async (setting: string) => {
        setCardIds([]);
        setCards([]);
        setCardsData([]);
        setFocusedRem(undefined);
        setIsTableExpanded(false);
        //setLoading(true);
        const currentFocusedRem = currentRem; //focusedRem; //await plugin.focus.getFocusedRem();
        if (currentFocusedRem) {
            const updateQueue = async () => {
                setLoading(true);
                const text = await getRemText(plugin, currentFocusedRem);
                setQueueRemText(text);
                //const fetchedCards = await getCardsOfRemDownDue(plugin, currentFocusedRem);
                let fetchedCards: Card[] = [];
                if(setting == "SETTING_DOWN")
                  fetchedCards = await getCardsOfRemDownDue(plugin, currentFocusedRem);

                if(setting == "SETTING_UP")
                  fetchedCards = await getCardsOfRemUpDue(plugin, currentFocusedRem);

                const ids = fetchedCards.map((c) => c._id);
                setCardIds(ids);
                setCards(fetchedCards);
                setCardsData(await questionsFromCards(plugin, fetchedCards));
                await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
                await plugin.storage.setSynced("currentQueueCardIds", ids);
                setLoading(false);
                setFocusedRem(currentFocusedRem);
                setIsTableExpanded(false);
            };
            updateQueue();
        }
    };

    const loadRemQueueDisabled = async (setting: string) => {
      setCardIds([]);
      setCards([]);
      setCardsData([]);
      setFocusedRem(undefined);
      setIsTableExpanded(false);

      const currentFocusedRem = currentRem;

      if(currentFocusedRem) {
        const updateCardsList = async () => {
          setLoading(true);
          const text = await getRemText(plugin, currentFocusedRem);
          setQueueRemText(text);
          ////
          if(setting == "SETTING_DOWN")
            setCardsData(await getCardsOfRemDownDisabled(plugin, currentFocusedRem));

          if(setting == "SETTING_UP")
            setCardsData(await getCardsOfRemUpDisabled(plugin, currentFocusedRem));

          setLoading(false);
          setFocusedRem(currentFocusedRem);
          setIsTableExpanded(false);
        };

        updateCardsList();
      }
    };

    const handleSearchDown = (setting: string) => {
      if (selectedOption === 'All') {
        loadRemQueue(setting);
      } else if (selectedOption === 'Due') {
        loadRemQueueDue(setting);
      } else if (selectedOption === 'Disabled') {
        loadRemQueueDisabled(setting);
      }
    };

    const updateCardInfo = async (cardId = undefined) => {
        const id = cardId ?? await plugin.storage.getSynced<string>("currentQueueCardId");
        if (id) {
            setCurrentCardId(id);
            const currentCard = await plugin.card.findOne(id);
            const rem = await currentCard?.getRem();
            const lastInterval = getLastInterval(currentCard?.repetitionHistory);
            setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
            setCurrentCardLastPractice(lastInterval ? (formatMilliseconds(lastInterval.intervalSetOn - Date.now(), true) + " ago") : "");
            setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
            setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory));
        }
    };

    async function onMouseClick() {
        updateCardInfo();
    }

    const openQueueRem = async () => {
        if (focusedRem) {
            await plugin.window.openRem(focusedRem);
        }
    };

    const openCurrentFlashcard = async () => {
        const currentCard = cards.find((card) => card._id === currentCardId);
        const rem = await currentCard?.getRem();
        if (rem) {
            await plugin.window.openRem(rem);
        }
    };

    const openRem = async (plugin: RNPlugin, id: string) => {
      const rem = await plugin.rem.findOne(id);

      if(rem)
        await plugin.window.openRem(rem);
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
        updateCardInfo();
    };

    const toogleCardList = () => {
        setIsListExpanded(!isListExpanded);
    };

    return (
  <div
    style={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      padding: 10,
      overflowY: "auto", // Add this to make the outer div scrollable
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}
    >
      <div style={{
        width: "100%",
            maxHeight: "600px",
            overflowY: "scroll",
            padding: "10px",
            border: "1px solid #ddd",
            marginRight: "20px",
          }}>
        <div>Practice Flashcards from {selectedRemText}</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <select
            value={selectedOption}
            onChange={(e) => setSelectedOption(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Due">Due</option>
            <option value="Disabled">Disabled</option>
          </select>
          <MyRemNoteButton
            text="Practice Descendants"
            onClick={async () => {handleSearchDown("SETTING_DOWN")}}
            img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"
          />
          <MyRemNoteButton
            text="Practice All"
            onClick={async () => {handleSearchDown("SETTING_UP")}}
            img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5"
          />
        </div>
      </div>
    </div>
    {loading ? (
      <div>Loading flashcards...</div>
    ) : cardsData.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // Removed flex: "1" and overflowY: "scroll" so it takes natural height
        }}
      >
        <div style={{ marginTop: "10px", marginRight: "20px" }}>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}>
            <MyRemNoteButton
              text={queueRemText ? "Current Queue: " + queueRemText : "No Rem selected"}
              onClick={openQueueRem}
              img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z"
            />
            <button onClick={toogleCardList} style={{ marginBottom: 10 }}>
              {(isListExpanded ? "Collapse Cards" : "Expand Cards") +
                "(" +
                cardsData.length +
                "): "}
            </button>
          </div>
          {isListExpanded && (
            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: 10,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    Question
                  </th>
                  <th
                    style={{
                      border: "1px solid #ddd",
                      padding: 8,
                      textAlign: "left",
                    }}
                  >
                    <MyRemNoteButton text={"Next Date"} onClick={() => {setSortAscending(!sortAscending); setIsListExpanded(false);}}/>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...cardsData].sort((a, b) => (sortAscending ? a.nextDate - b.nextDate : b.nextDate - a.nextDate)).map((c) => (
                  <tr key={c.id}>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>
                      <MyRemNoteButton
                        text={c.text}
                        onClick={async () => {
                          openRem(plugin, c.id);
                        }}
                      />
                    </td>
                    <td style={{ border: "1px solid #ddd", padding: 8 }}>
                      {formatMilliseconds(c.nextDate - Date.now())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <div style={{ marginTop: "10px", marginRight: "20px" }}>
          <button onClick={toggleTableExpansion} style={{ marginBottom: 10 }}>
            {isTableExpanded ? "- Card Information: " : "+ Card Information: "}
            {currentCardText}
          </button>
          <MyRemNoteButton
            text=""
            onClick={openCurrentFlashcard}
            img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z"
          />
          {isTableExpanded && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: 10,
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", }}> Due </th>
                  <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", }}> Interval </th>
                  <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", }}> Last Rating </th>
                  <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", }}> Last Practice </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardRepetitionTiming == 0
                      ? ""
                      : currentCardRepetitionTiming < 0
                      ? "Late (" + formatMilliseconds(currentCardRepetitionTiming) + ")"
                      : "Early (" + formatMilliseconds(currentCardRepetitionTiming) + ")"}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardLastInterval}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardLastRating}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    {currentCardLastPractice}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div
          onClick={onMouseClick}
          style={{
            height: "600px",
            overflowY: "scroll",
            padding: "10px",
            border: "1px solid #ddd",
            marginRight: "20px",
          }}
        >
          <Queue
            cardIds={cardIds}
            width={"100%"}
            maxWidth={"100%"}
            height={"100%"}
            maxHeight={"100%"}
          />
        </div>
      </div>
    ) : (
      <div>No cards to display. cardsData is empty: {JSON.stringify(cardsData)}</div>
    )}
  </div>
);
}

renderWidget(CustomQueueWidget);