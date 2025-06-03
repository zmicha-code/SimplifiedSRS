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

  //
  if(isDocument && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];

    if(await referencedRem.isDocument()) {
      //console.log("Referenced Rem is document");

      return [referencedRem];
    } else {
      await plugin.app.toast('Mistake: A DOCUMENT should never reference anything other than DOCUMENT. (' + await getRemText(plugin, rem) + ")");
    }
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

async function isFlashcard(plugin: RNPlugin, rem: Rem): Promise <boolean> {

  const children = await getCleanChildren(plugin, rem);

  for(const c of children) {
    if(await c.isCardItem())
      return true;
  }

  return false;
}

async function getFlashcard(plugin: RNPlugin, rem: Rem): Promise <Card[]> {

  const children = await getCleanChildren(plugin, rem);

  for(const c of children) {
    if(await c.isCardItem())
      return await c.getCards();
  }

  return [];
}

interface SearchOptions {
  due: boolean,
  disabled: boolean,
  includePortals: boolean,
  bothDirections: boolean // otherwise Down
}

// Helper function assumed to be defined elsewhere
function isDue(card: Card): boolean {
  const lastInterval = getLastInterval(card?.repetitionHistory);
  return lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() < 0 : true;
}

async function getCardsOfRem(
  plugin: RNPlugin,
  rem: Rem,
  searchOptions: SearchOptions,
  processed = new Set<string>(),
  addedCardIds = new Set<string>()
): Promise<Card[]> {
  if (processed.has(rem._id)) return [];
  processed.add(rem._id);

  let cards: Card[] = [];

  if(!rem) return cards;

  // Handle upward direction if bothDirections is true
  if (searchOptions.bothDirections) {
    const lineages = await getAncestorLineage(plugin, rem);
    for (const lineage of lineages) {
        for (const ancestor of lineage) {
            const ancestorCards = await getCardsOfRem(plugin, ancestor, { ...searchOptions, bothDirections: false }, processed, addedCardIds);
            cards = cards.concat(ancestorCards);
        }
    }
  }

  // Add cards from the current rem, filtered by due if specified
  const remCards = rem.getCards ? await rem.getCards() : [];
  for (const card of remCards) {
    if (!addedCardIds.has(card._id)) {
      addedCardIds.add(card._id);
      if (!searchOptions.due || isDue(card)) {
        cards.push(card);
      }
    }
  }

  // Handle portals if includePortals is true
  if (searchOptions.includePortals) {
    const childrenRem = await getCleanChildren(plugin, rem);

    for (const child of childrenRem) {
      if (await child.getType() === RemType.PORTAL) {
          const rems = await child.getPortalDirectlyIncludedRem();

          //console.log("In Portal:");
          for(const r of rems) {
            //console.log(await getRemText(plugin, r))
            // Using r instead of await plugin.rem.findOne(r._id) throws a runtime error
            cards = cards.concat(await getCardsOfRem(plugin, await plugin.rem.findOne(r._id) as Rem, { ...searchOptions, bothDirections: false }, processed, addedCardIds));
          }
      }
    }
  }
  
  // Get descendants and referencing rems for recursion and reference handling
  const childrenRem = await getCleanChildrenAll(plugin, rem);

  // Handle references in descendants (e.g., flashcards referenced in answers)
  for (const child of childrenRem) {
    const refs = await child.remsBeingReferenced();
    if (refs.length > 0 && (await child.isCardItem() || await child.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))) {
      const ref = refs[0];
      const refCards = await ref.getCards();
      for (const card of refCards) {
        if (!addedCardIds.has(card._id)) {
          addedCardIds.add(card._id);
          if (!searchOptions.due || isDue(card)) {
            cards.push(card);
          }
        }
      }
    }
  }

  // Handle rems referencing this rem (e.g., questions where this rem is an answer)
  const childrenRef = await rem.remsReferencingThis();
  for (const ref of childrenRef) {
    if (await ref.isCardItem() || await ref.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) {
      const question = await ref.getParentRem();
      if (question) {
        const questionCards = await question.getCards();
        for (const card of questionCards) {
          if (!addedCardIds.has(card._id)) {
            addedCardIds.add(card._id);
            if (!searchOptions.due || isDue(card)) {
              cards.push(card);
            }
          }
        }
      }
    }
  }

  // Recurse into descendants and referencing rems
  const children = [...childrenRem, ...childrenRef];
  for (const child of children) {
    cards = cards.concat(await getCardsOfRem(plugin, child, searchOptions, processed, addedCardIds));
  }

  return cards;
}

interface DisabledRemInfo {
  id: string;
  text: string;
  nextDate: number;
}

async function getDisabledRem(
  plugin: RNPlugin,
  rem: Rem,
  searchOptions: SearchOptions,
  processed = new Set<string>(),
  addedRemIds = new Set<string>()
): Promise<DisabledRemInfo[]> {
  // Prevent infinite loops by skipping processed rems
  if (processed.has(rem._id)) return [];
  processed.add(rem._id);

  let disabledRems: DisabledRemInfo[] = [];

  // Handle upward direction if bothDirections is true
  if (searchOptions.bothDirections) {
    const lineages = await getAncestorLineage(plugin, rem);
    for (const lineage of lineages) {
      for (const ancestor of lineage) {
        const ancestorDisabledRems = await getDisabledRem(
          plugin,
          ancestor,
          { ...searchOptions, bothDirections: false }, // Avoid infinite upward recursion
          processed,
          addedRemIds
        );
        disabledRems = disabledRems.concat(ancestorDisabledRems);
      }
    }
  }

  // Check if the current rem is a disabled flashcard
  if (!(await rem.getEnablePractice()) && (await isFlashcard(plugin, rem))) {
    if (!addedRemIds.has(rem._id)) {
      addedRemIds.add(rem._id);
      const text = await getRemText(plugin, rem);
      disabledRems.push({ id: rem._id, text, nextDate: 0 });
    }
  }

  // Handle portals if includePortals is true
  if (searchOptions.includePortals) {
    const childrenRem = await getCleanChildren(plugin, rem);
    for (const child of childrenRem) {
      if (await child.getType() === RemType.PORTAL) {
        const portalRems = await child.getPortalDirectlyIncludedRem();
        for (const pRem of portalRems) {
          const portalDisabledRems = await getDisabledRem(
            plugin,
            await plugin.rem.findOne(pRem._id) as Rem,
            { ...searchOptions, bothDirections: false }, // Limit direction in portals
            processed,
            addedRemIds
          );
          disabledRems = disabledRems.concat(portalDisabledRems);
        }
      }
    }
  }

  // Get all children and referencing rems for further processing
  const childrenRem = await getCleanChildrenAll(plugin, rem);

  // Handle references in descendants (e.g., disabled flashcards referenced in answers)
  for (const child of childrenRem) {
    const refs = await child.remsBeingReferenced();
    if (
      refs.length > 0 &&
      (await child.isCardItem() || await child.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail))
    ) {
      const ref = refs[0];
      if (!(await ref.getEnablePractice()) && (await isFlashcard(plugin, ref))) {
        if (!addedRemIds.has(ref._id)) {
          addedRemIds.add(ref._id);
          const text = await getRemText(plugin, ref);
          disabledRems.push({ id: ref._id, text, nextDate: 0 });
        }
      }
    }
  }

  // Handle rems referencing this rem (e.g., questions where this rem is an answer)
  const childrenRef = await rem.remsReferencingThis();
  for (const ref of childrenRef) {
    if (
      await ref.isCardItem() || 
      await ref.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)
    ) {
      const question = await ref.getParentRem();
      if (question && !(await question.getEnablePractice())) {
        if (!addedRemIds.has(question._id)) {
          addedRemIds.add(question._id);
          const text = await getRemText(plugin, question);
          disabledRems.push({ id: question._id, text, nextDate: 0 });
        }
      }
    }
  }

  // Recurse into descendants and referencing rems
  const children = [...childrenRem, ...childrenRef];
  for (const child of children) {
    const childDisabledRems = await getDisabledRem(
      plugin,
      child,
      searchOptions,
      processed,
      addedRemIds
    );
    disabledRems = disabledRems.concat(childDisabledRems);
  }

  return disabledRems;
}

async function loadCards(plugin: RNPlugin, rem: Rem | undefined, cardIds: string[]): Promise<Card[]> {
    if(!rem)
        return [];

    // Cant use this after introducing multiple search options and not just RemDown
    //const allCards = await getCardsOfRemDown(plugin, rem);
    //const cardIdSet = new Set(cardIds);
    //const filteredCards = allCards.filter(card => cardIdSet.has(card._id));
    //return filteredCards;
    return plugin.card.findMany(cardIds);
}

function getLastRatingStr_(history: RepetitionStatus[] | undefined): string {
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

function getLastRatingStr(history: RepetitionStatus[] | undefined, count: number = 1): string[] {
    // Handle undefined or empty array
    if (!history || history.length === 0) {
        return [];
    }

    const result: string[] = [];

    // Iterate from the last element to the first
    for (let i = history.length - 1; i >= 0; i--) {
        const score = history[i].score;
        // Skip TOO_EARLY and VIEWED_AS_LEECH
        if (score !== QueueInteractionScore.TOO_EARLY && score !== QueueInteractionScore.VIEWED_AS_LEECH) {
            let ratingStr = "";
            switch (score) {
                case QueueInteractionScore.AGAIN:
                    ratingStr = "Forgot";
                    break;
                case QueueInteractionScore.HARD:
                    ratingStr = "Partially recalled";
                    break;
                case QueueInteractionScore.GOOD:
                    ratingStr = "Recalled with effort";
                    break;
                case QueueInteractionScore.EASY:
                    ratingStr = "Easily recalled";
                    break;
                case QueueInteractionScore.RESET:
                    ratingStr = "Reset";
                    break;
                default:
                    continue; // Skip unexpected scores
            }
            result.push(ratingStr);
            if (result.length === count) {
                break;
            }
        }
    }

    return result;
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
    const [currentCardLastRating, setcurrentCardLastRating] = useState<string[]>([]);
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const [queueRemText, setQueueRemText] = useState<string>("");
    const [buildQueueRemText, setBuildQueueRemText] = useState<string>("");
    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    // Updated state type to array of objects
    const [cardsData, setCardsData] = useState<{ id: string, text: string , nextDate: number}[]>([]);
    const [sortAscending, setSortAscending] = useState<boolean>(true);

    //
    const [isBuildQueueExpanded, setIsBuildQueueExpanded] = useState<boolean>(false);
    const [searchOptions, setSearchOptions] = useState<SearchOptions>({ due: false, disabled: false, includePortals: false, bothDirections: false});

    const [isQueueExpanded, setIsQueueExpanded] = useState<boolean>(true);

    const buildQueueRem = useTracker(async (reactPlugin) => {
            return await reactPlugin.focus.getFocusedRem();
        }
    );

    // Init from storage
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

    // Event handlers
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
      const updateBuildQueueRemText = async () => {
        const txt = await getRemText(plugin, buildQueueRem);
        setBuildQueueRemText(txt == "" ? "No Rem Selected" : txt);
      };
      updateBuildQueueRemText();
    }, [buildQueueRem]);

    const loadRemQueue = async () => {
      //console.log(await getRemText(plugin, focusedRem));

      setCardIds([]);
      setCards([]);
      setCardsData([]);
      //setFocusedRem(undefined);
      setIsTableExpanded(false);
      //setLoading(true);
      const currentFocusedRem = buildQueueRem; // focusedRem; //await plugin.focus.getFocusedRem();
      if (currentFocusedRem) {
          const updateQueue = async () => {
              setLoading(true);
              const text = await getRemText(plugin, currentFocusedRem);
              setQueueRemText(text);

              //const fetchedCards = await getCardsOfRemDown(plugin, currentFocusedRem);
              if(!searchOptions.disabled) {
                let fetchedCards: Card[] = [];

                fetchedCards = await getCardsOfRem(plugin, currentFocusedRem, searchOptions) as Card[];

                const ids = fetchedCards.map((c) => c._id);
                setCardIds(ids);
                setCards(fetchedCards);
                setCardsData(await questionsFromCards(plugin, fetchedCards));

                await plugin.storage.setSynced("currentQueueCardIds", ids);
              } else {
                setCardsData(await getDisabledRem(plugin, currentFocusedRem, searchOptions) as DisabledRemInfo[])
              }
              await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
              setLoading(false);
              setFocusedRem(currentFocusedRem);
              setIsTableExpanded(false);
              setIsBuildQueueExpanded(false);
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
            const lastInterval = getLastInterval(currentCard?.repetitionHistory);
            setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
            setCurrentCardLastPractice(lastInterval ? (formatMilliseconds(lastInterval.intervalSetOn - Date.now(), true) + " ago") : "");
            setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
            setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory, 5));
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

    const toogleBuildQueue = () => {
      setIsBuildQueueExpanded(!isBuildQueueExpanded);
      updateCardInfo();
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
        updateCardInfo();
    };

    const toogleCardList = () => {
        setIsListExpanded(!isListExpanded);
    };

    const toogleQueueExpansion = () => {
      setIsQueueExpanded(!isQueueExpanded);
    };

    const scoreToImage = new Map<string, string>([
      ["Skip", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTIwIDYuMDQyYzAgMS4xMTItLjkwMyAyLjAxNC0yIDIuMDE0cy0yLS45MDItMi0yLjAxNFYyLjAxNEMxNiAuOTAxIDE2LjkwMyAwIDE4IDBzMiAuOTAxIDIgMi4wMTR2NC4wMjh6Ii8+PHBhdGggZmlsbD0iI0ZGQUMzMyIgZD0iTTkuMTggMzZjLS4yMjQgMC0uNDUyLS4wNTItLjY2Ni0uMTU5YTEuNTIxIDEuNTIxIDAgMCAxLS42NjctMi4wMjdsOC45NC0xOC4xMjdjLjI1Mi0uNTEyLjc2OC0uODM1IDEuMzMzLS44MzVzMS4wODEuMzIzIDEuMzMzLjgzNWw4Ljk0MSAxOC4xMjdhMS41MiAxLjUyIDAgMCAxLS42NjYgMi4wMjcgMS40ODIgMS40ODIgMCAwIDEtMS45OTktLjY3NkwxOC4xMjEgMTkuNzRsLTcuNjA3IDE1LjQyNUExLjQ5IDEuNDkgMCAwIDEgOS4xOCAzNnoiLz48cGF0aCBmaWxsPSIjNTg1OTVCIiBkPSJNMTguMTIxIDIwLjM5MmEuOTg1Ljk4NSAwIDAgMS0uNzAyLS4yOTVMMy41MTIgNS45OThjLS4zODgtLjM5NC0uMzg4LTEuMDMxIDAtMS40MjRzMS4wMTctLjM5MyAxLjQwNCAwTDE4LjEyMSAxNy45NiAzMS4zMjQgNC41NzNhLjk4NS45ODUgMCAwIDEgMS40MDUgMCAxLjAxNyAxLjAxNyAwIDAgMSAwIDEuNDI0bC0xMy45MDUgMTQuMWEuOTkyLjk5MiAwIDAgMS0uNzAzLjI5NXoiLz48cGF0aCBmaWxsPSIjREQyRTQ0IiBkPSJNMzQuMDE1IDE5LjM4NWMwIDguODk4LTcuMTE1IDE2LjExMS0xNS44OTQgMTYuMTExLTguNzc3IDAtMTUuODkzLTcuMjEzLTE1Ljg5My0xNi4xMTEgMC04LjkgNy4xMTYtMTYuMTEzIDE1Ljg5My0xNi4xMTMgOC43NzgtLjAwMSAxNS44OTQgNy4yMTMgMTUuODk0IDE2LjExM3oiLz48cGF0aCBmaWxsPSIjRTZFN0U4IiBkPSJNMzAuMDQxIDE5LjM4NWMwIDYuNjc0LTUuMzM1IDEyLjA4NC0xMS45MiAxMi4wODQtNi41ODMgMC0xMS45MTktNS40MS0xMS45MTktMTIuMDg0QzYuMjAyIDEyLjcxIDExLjUzOCA3LjMgMTguMTIxIDcuM2M2LjU4NS0uMDAxIDExLjkyIDUuNDEgMTEuOTIgMTIuMDg1eiIvPjxwYXRoIGZpbGw9IiNGRkNDNEQiIGQ9Ik0zMC4wNCAxLjI1N2E1Ljg5OSA1Ljg5OSAwIDAgMC00LjIxNCAxLjc3bDguNDI5IDguNTQ0QTYuMDY0IDYuMDY0IDAgMCAwIDM2IDcuMjk5YzAtMy4zMzYtMi42NjktNi4wNDItNS45Ni02LjA0MnptLTI0LjA4IDBhNS45IDUuOSAwIDAgMSA0LjIxNCAxLjc3bC04LjQyOSA4LjU0NEE2LjA2NCA2LjA2NCAwIDAgMSAwIDcuMjk5YzAtMy4zMzYgMi42NjgtNi4wNDIgNS45Ni02LjA0MnoiLz48cGF0aCBmaWxsPSIjNDE0MDQyIiBkPSJNMjMgMjBoLTVhMSAxIDAgMCAxLTEtMXYtOWExIDEgMCAwIDEgMiAwdjhoNGExIDEgMCAxIDEgMCAyeiIvPjwvc3ZnPg=="],
      ["Forgot", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0REMkU0NCIgZD0iTTIxLjUzMyAxOC4wMDIgMzMuNzY4IDUuNzY4YTIuNSAyLjUgMCAwIDAtMy41MzUtMy41MzVMMTcuOTk4IDE0LjQ2NyA1Ljc2NCAyLjIzM2EyLjQ5OCAyLjQ5OCAwIDAgMC0zLjUzNSAwIDIuNDk4IDIuNDk4IDAgMCAwIDAgMy41MzVsMTIuMjM0IDEyLjIzNEwyLjIwMSAzMC4yNjVhMi40OTggMi40OTggMCAwIDAgMS43NjggNC4yNjdjLjY0IDAgMS4yOC0uMjQ0IDEuNzY4LS43MzJsMTIuMjYyLTEyLjI2MyAxMi4yMzQgMTIuMjM0YTIuNDkzIDIuNDkzIDAgMCAwIDEuNzY4LjczMiAyLjUgMi41IDAgMCAwIDEuNzY4LTQuMjY3TDIxLjUzMyAxOC4wMDJ6Ii8+PC9zdmc+"],
      ["Partially recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48ZWxsaXBzZSBmaWxsPSIjNjY0NTAwIiBjeD0iMTIiIGN5PSIxMy41IiByeD0iMi41IiByeT0iMy41Ii8+PGVsbGlwc2UgZmlsbD0iIzY2NDUwMCIgY3g9IjI0IiBjeT0iMTMuNSIgcng9IjIuNSIgcnk9IjMuNSIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik0yNSAyMWE0IDQgMCAwIDEgMCA4SDExYTQgNCAwIDAgMSAwLThoMTR6Ii8+PHBhdGggZmlsbD0iIzY2NDUwMCIgZD0iTTI1IDIwSDExYy0yLjc1NyAwLTUgMi4yNDMtNSA1czIuMjQzIDUgNSA1aDE0YzIuNzU3IDAgNS0yLjI0MyA1LTVzLTIuMjQzLTUtNS01em0wIDJhMi45OTcgMi45OTcgMCAwIDEgMi45NDkgMi41SDI0LjVWMjJoLjV6bS0xLjUgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3pNMTEgMjJoLjV2Mi41SDguMDUxQTIuOTk3IDIuOTk3IDAgMCAxIDExIDIyem0wIDZhMi45OTcgMi45OTcgMCAwIDEtMi45NDktMi41SDExLjVWMjhIMTF6bTEuNSAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNC41IDBoLS41di0yLjVoMy40NDlBMi45OTcgMi45OTcgMCAwIDEgMjUgMjh6Ii8+PC9zdmc+"],
      ["Recalled with effort", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48cGF0aCBmaWxsPSIjNjY0NTAwIiBkPSJNMjguNDU3IDE3Ljc5N2MtLjA2LS4xMzUtMS40OTktMy4yOTctNC40NTctMy4yOTctMi45NTcgMC00LjM5NyAzLjE2Mi00LjQ1NyAzLjI5N2EuNTAzLjUwMyAwIDAgMCAuNzU1LjYwNWMuMDEyLS4wMDkgMS4yNjItLjkwMiAzLjcwMi0uOTAyIDIuNDI2IDAgMy42NzQuODgxIDMuNzAyLjkwMWEuNDk4LjQ5OCAwIDAgMCAuNzU1LS42MDR6bS0xMiAwYy0uMDYtLjEzNS0xLjQ5OS0zLjI5Ny00LjQ1Ny0zLjI5Ny0yLjk1NyAwLTQuMzk3IDMuMTYyLTQuNDU3IDMuMjk3YS40OTkuNDk5IDAgMCAwIC43NTQuNjA1QzguMzEgMTguMzkzIDkuNTU5IDE3LjUgMTIgMTcuNWMyLjQyNiAwIDMuNjc0Ljg4MSAzLjcwMi45MDFhLjQ5OC40OTggMCAwIDAgLjc1NS0uNjA0ek0xOCAyMmMtMy42MjMgMC02LjAyNy0uNDIyLTktMS0uNjc5LS4xMzEtMiAwLTIgMiAwIDQgNC41OTUgOSAxMSA5IDYuNDA0IDAgMTEtNSAxMS05IDAtMi0xLjMyMS0yLjEzMi0yLTItMi45NzMuNTc4LTUuMzc3IDEtOSAxeiIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik05IDIzczMgMSA5IDEgOS0xIDktMS0yIDQtOSA0LTktNC05LTR6Ii8+PC9zdmc+"],
      ["Easily recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0iTTE0LjE3NCAxNy4wNzUgNi43NSA3LjU5NGwtMy43MjIgOS40ODF6Ii8+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0ibTE3LjkzOCA1LjUzNC02LjU2MyAxMi4zODlIMjQuNXoiLz48cGF0aCBmaWxsPSIjRjQ5MDBDIiBkPSJtMjEuODI2IDE3LjA3NSA3LjQyNC05LjQ4MSAzLjcyMiA5LjQ4MXoiLz48cGF0aCBmaWxsPSIjRkZDQzREIiBkPSJNMjguNjY5IDE1LjE5IDIzLjg4NyAzLjUyM2wtNS44OCAxMS42NjgtLjAwNy4wMDMtLjAwNy0uMDA0LTUuODgtMTEuNjY4TDcuMzMxIDE1LjE5QzQuMTk3IDEwLjgzMyAxLjI4IDguMDQyIDEuMjggOC4wNDJTMyAyMC43NSAzIDMzaDMwYzAtMTIuMjUgMS43Mi0yNC45NTggMS43Mi0yNC45NThzLTIuOTE3IDIuNzkxLTYuMDUxIDcuMTQ4eiIvPjxjaXJjbGUgZmlsbD0iIzVDOTEzQiIgY3g9IjE3Ljk1NyIgY3k9IjIyIiByPSIzLjY4OCIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjI2LjQ2MyIgY3k9IjIyIiByPSIyLjQxMiIvPjxjaXJjbGUgZmlsbD0iI0REMkU0NCIgY3g9IjMyLjg1MiIgY3k9IjIyIiByPSIxLjk4NiIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjkuNDUiIGN5PSIyMiIgcj0iMi40MTIiLz48Y2lyY2xlIGZpbGw9IiNERDJFNDQiIGN4PSIzLjA2MSIgY3k9IjIyIiByPSIxLjk4NiIvPjxwYXRoIGZpbGw9IiNGRkFDMzMiIGQ9Ik0zMyAzNEgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnptMC0zLjQ4NkgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnoiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxLjQ0NyIgY3k9IjguMDQyIiByPSIxLjQwNyIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjYuNzUiIGN5PSI3LjU5NCIgcj0iMS4xOTIiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxMi4xMTMiIGN5PSIzLjUyMyIgcj0iMS43ODQiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIzNC41NTMiIGN5PSI4LjA0MiIgcj0iMS40MDciLz48Y2lyY2xlIGZpbGw9IiNGNDkwMEMiIGN4PSIyOS4yNSIgY3k9IjcuNTk0IiByPSIxLjE5MiIvPjxjaXJjbGUgZmlsbD0iI0ZGQ0M0RCIgY3g9IjIzLjg4NyIgY3k9IjMuNTIzIiByPSIxLjc4NCIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjE3LjkzOCIgY3k9IjUuNTM0IiByPSIxLjc4NCIvPjwvc3ZnPg=="]
    ]);

    return (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10, overflowY: "auto" }} >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, }}>
          <div style={{ width: "100%", maxHeight: "600px", padding: "10px", border: "1px solid #ddd", marginRight: "20px" }}>
            <button style={{ width: "100%" }} onClick={toogleBuildQueue}>{isBuildQueueExpanded ? "- Build Queue" : "+ Build Queue"}</button>
            {isBuildQueueExpanded && (
              <div style={{ marginTop: "10px" }}>
                <div>Rem: {buildQueueRemText}</div>
                <label style={{ display: "block" }}><input type="radio" name="option_direction" value="All Connected" checked={searchOptions?.bothDirections === true} onChange={(e) => setSearchOptions({ ...searchOptions, bothDirections: true })} /> All Connected</label>
                <label style={{ display: "block" }}><input type="radio" name="option_direction" value="Descendants" checked={searchOptions?.bothDirections === false} onChange={(e) => setSearchOptions({ ...searchOptions, bothDirections: false })} /> Descendants</label>
                <label style={{ display: "block" }}><input type="checkbox" checked={searchOptions?.due} onChange={(e) => setSearchOptions({ ...searchOptions, due: !searchOptions.due })} /> Due</label>
                <label style={{ display: "block" }}><input type="checkbox" checked={searchOptions?.disabled} onChange={(e) => setSearchOptions({ ...searchOptions, disabled: !searchOptions.disabled })} /> Disabled</label>
                <label style={{ display: "block" }}><input type="checkbox" checked={searchOptions?.includePortals} onChange={(e) => setSearchOptions({ ...searchOptions, includePortals: !searchOptions.includePortals })} /> Portals</label>
                <MyRemNoteButton text="Build Queue" onClick={async () => {await loadRemQueue()}} img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" />
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div>Loading flashcards...</div>
        ) : cardsData.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, }}>
              <div style={{ width: "100%", maxHeight: "600px", overflowY: "scroll", padding: "10px", border: "1px solid #ddd", marginRight: "20px" }}>
                <button style={{ width: "100%" }} onClick={toogleCardList}>{isListExpanded ? "- Current Queue" : "+ Current Queue"} ({cardsData.length})</button>
                {isListExpanded && (
                  <div style={{ marginTop: "10px" }}>
                    <MyRemNoteButton text={queueRemText ? queueRemText : "No Rem selected"} onClick={openQueueRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                      <thead>
                        <tr>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Question</th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}><MyRemNoteButton text="Next Date" onClick={() => { setSortAscending(!sortAscending); setIsListExpanded(false); }} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...cardsData].sort((a, b) => (sortAscending ? a.nextDate - b.nextDate : b.nextDate - a.nextDate)).map((c) => (
                          <tr key={c.id}>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}><MyRemNoteButton text={c.text} onClick={async () => { openRem(plugin, c.id); }} /></td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>{formatMilliseconds(c.nextDate - Date.now())}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, }}>
              <div style={{ width: "100%", maxHeight: "600px", padding: "10px", border: "1px solid #ddd", marginRight: "20px" }}>
                <button style={{ width: "100%" }} onClick={toggleTableExpansion}>{isTableExpanded ? "- Card Information" : "+ Card Information"}: {currentCardText}</button>
                {isTableExpanded && (
                  <div style={{ marginTop: "10px" }}>
                    <MyRemNoteButton text="Open" onClick={openCurrentFlashcard} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                      <thead>
                        <tr>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Due</th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Interval</th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Rating</th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>Last Practice</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardRepetitionTiming == 0 ? "" : currentCardRepetitionTiming < 0 ? "Late (" + formatMilliseconds(currentCardRepetitionTiming) + ")" : "Early (" + formatMilliseconds(currentCardRepetitionTiming) + ")"}</td>
                          <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastInterval}</td>
                          <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                            {currentCardLastRating.length > 0 ? (
                              currentCardLastRating.slice().reverse().map((rating, index) => (
                                <img
                                  key={index}
                                  style={{
                                    width: '20px',
                                    height: '20px',
                                    marginRight: index < currentCardLastRating.length - 1 ? '5px' : '0'
                                  }}
                                  src={scoreToImage.get(rating)}
                                />
                              ))
                            ) : (
                              <div></div>
                            )}
                          </td>
                          <td style={{ border: "1px solid #ddd", padding: 8 }}>{currentCardLastPractice}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div
              onClick={onMouseClick}
              style={{
                height: "700px",
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