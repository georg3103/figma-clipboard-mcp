// Scene model over the raw .fig nodes: hierarchy, layer trees and component trees.

import { stylesOf } from './style.js';

export const key = (guid) => (guid ? `${guid.sessionID}:${guid.localID}` : null);

/** Reference to another asset: local ones carry a guid, library ones an assetRef with a publish key. */
export const assetKey = (ref) => (ref && ref.assetRef && ref.assetRef.key) || null;

/** Figma color (0..1 per channel) as hex; alpha is appended only when it is not fully opaque. */
export const hex = (c) =>
  '#' +
  ['r', 'g', 'b']
    .map((k) => Math.round((c[k] || 0) * 255).toString(16).padStart(2, '0'))
    .join('') +
  (c.a !== undefined && c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');

/** Indexes the nodes and links parents to their children. */
export function buildScene({ message, source, meta }) {
  const nodes = new Map();
  for (const node of message.nodeChanges || []) {
    nodes.set(key(node.guid), node);
  }

  const children = new Map();
  const roots = [];
  for (const node of nodes.values()) {
    const parentId = key(node.parentIndex && node.parentIndex.guid);
    if (parentId && nodes.has(parentId)) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
    } else {
      roots.push(node);
    }
  }

  // Child order is a fractional index in parentIndex.position, so a plain string compare sorts it.
  for (const list of children.values()) {
    list.sort((a, b) => {
      const pa = (a.parentIndex && a.parentIndex.position) || '';
      const pb = (b.parentIndex && b.parentIndex.position) || '';
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
  }

  // Indexes for the style mappers: paints point at variables and text at styles, both by publish key.
  const variablesByKey = new Map();
  const stylesByKey = new Map();
  for (const node of nodes.values()) {
    if (node.key && node.type === 'VARIABLE') variablesByKey.set(node.key, node);
    if (node.key && node.styleType) stylesByKey.set(node.key, node);
  }

  return { nodes, children, roots, source, meta, blobs: message.blobs, variablesByKey, stylesByKey };
}

const childrenOf = (scene, node) => scene.children.get(key(node.guid)) || [];

export function getNode(scene, nodeId) {
  const node = scene.nodes.get(nodeId);
  if (!node) throw new Error(`Node ${nodeId} is not part of the loaded scene.`);
  return node;
}

// Figma's internal page holding variables and styles has no place in a list of screens.
const INTERNAL_CANVAS = 'Internal Only Canvas';
const NON_VISUAL = new Set(['VARIABLE', 'VARIABLE_SET']);

/** Top-level nodes: whatever sits on the pages, plus the roots of a copied selection. */
export function listFrames(scene) {
  const result = [];
  const visit = (node, page) => {
    if (node.type === 'DOCUMENT') {
      for (const child of childrenOf(scene, node)) visit(child, page);
      return;
    }
    if (node.type === 'CANVAS') {
      if (node.name === INTERNAL_CANVAS) return;
      for (const child of childrenOf(scene, node)) visit(child, node.name);
      return;
    }
    if (NON_VISUAL.has(node.type)) return;
    result.push({
      page: page || null,
      name: node.name,
      type: node.type,
      node_id: key(node.guid),
      size: node.size ? { w: Math.round(node.size.x), h: Math.round(node.size.y) } : null,
    });
  };
  for (const root of scene.roots) visit(root, null);
  return result;
}

/** Layer tree of a node. style: none is structure only, layout adds geometry, full adds paints and type. */
export function layerTree(scene, nodeId, maxDepth = 4, style = 'layout') {
  const walk = (node, depth) => {
    const entry = { name: node.name, type: node.type, node_id: key(node.guid) };

    if (node.textData && node.textData.characters) entry.text = node.textData.characters;
    if (node.size) entry.size = { w: Math.round(node.size.x), h: Math.round(node.size.y) };
    if (node.visible === false) entry.visible = false;

    if (style === 'none') {
      if (node.stackMode && node.stackMode !== 'NONE') entry.layout = node.stackMode;
    } else {
      Object.assign(entry, stylesOf(node, scene, style));
    }

    const kids = childrenOf(scene, node);
    if (kids.length && depth < maxDepth) {
      entry.children = kids.map((child) => walk(child, depth + 1));
    } else if (kids.length) {
      entry.truncated_children = kids.length;
    }
    return entry;
  };

  return walk(getNode(scene, nodeId), 0);
}

/** A component and, when it is a variant, its set — property definitions live on the set. */
function ownerOf(scene, symbolId) {
  const symbol = scene.nodes.get(key(symbolId));
  if (!symbol) return { symbol: null, owner: null, set: null };
  const parent = scene.nodes.get(key(symbol.parentIndex && symbol.parentIndex.guid));
  const set = parent && parent.isStateGroup ? parent : null;
  return { symbol, owner: set || symbol, set };
}

const propNamesOf = (owner) =>
  new Map(((owner && owner.componentPropDefs) || []).map((def) => [key(def.id), def.name]));

/** Every style of a single node, for a spot check without walking a tree. */
export function nodeStyles(scene, nodeId) {
  const node = getNode(scene, nodeId);
  return {
    name: node.name,
    type: node.type,
    node_id: nodeId,
    text: (node.textData && node.textData.characters) || undefined,
    size: node.size ? { w: Math.round(node.size.x), h: Math.round(node.size.y) } : undefined,
    ...stylesOf(node, scene, 'full'),
  };
}

/** Describes a component (SYMBOL) and the variant set it belongs to. */
function describeSymbol(scene, symbolId) {
  const { symbol, owner, set } = ownerOf(scene, symbolId);
  if (!symbol) {
    return { component: null, note: 'the component definition is not part of this copy' };
  }

  const propNames = propNamesOf(owner);
  const variant = {};
  for (const spec of symbol.variantPropSpecs || []) {
    variant[propNames.get(key(spec.propDefId)) || 'variant'] = spec.value;
  }

  return {
    component: owner.name,
    variant_name: set ? symbol.name : null,
    key: owner.componentKey || null,
    remote: Boolean(symbol.sourceLibraryKey),
    symbol_id: key(symbolId),
    variant: Object.keys(variant).length ? variant : undefined,
  };
}

/**
 * Property values assigned to an instance: text, booleans, swapped instances.
 * Property names are known only when the component itself is in the scene; otherwise ids remain.
 */
function instanceProps(scene, node, propNames) {
  const props = {};
  for (const assignment of node.componentPropAssignments || []) {
    const value = assignment.value || {};
    // INSTANCE_SWAP stores a component reference — show its name when that component is in the scene.
    const swapped = value.guidValue && scene.nodes.get(key(value.guidValue));
    const plain =
      (value.textValue && value.textValue.characters) ??
      value.boolValue ??
      value.floatValue ??
      (value.guidValue ? (swapped ? swapped.name : key(value.guidValue)) : undefined);
    if (plain !== undefined) {
      const id = key(assignment.defID);
      // Figma writes a localID one higher in the assignment than in the property definition.
      const shifted = assignment.defID
        ? `${assignment.defID.sessionID}:${assignment.defID.localID - 1}`
        : id;
      props[propNames.get(id) || propNames.get(shifted) || id] = plain;
    }
  }
  return Object.keys(props).length ? props : undefined;
}

/** Tree of component instances inside a node, and nothing else. */
export function componentTree(scene, nodeId, maxDepth = 6) {
  const collect = (node, depth) => {
    const found = [];
    for (const child of childrenOf(scene, node)) {
      if (child.type === 'INSTANCE') {
        if (depth >= maxDepth) continue;
        const symbolId = (child.symbolData && child.symbolData.symbolID) || child.symbolID;
        const entry = {
          name: child.name,
          node_id: key(child.guid),
          ...describeSymbol(scene, symbolId),
        };
        const props = instanceProps(scene, child, propNamesOf(ownerOf(scene, symbolId).owner));
        if (props) entry.props = props;
        const nested = collect(child, depth + 1);
        if (nested.length) entry.children = nested;
        found.push(entry);
      } else {
        // Plain layers stay out of the tree, but the walk continues through them.
        found.push(...collect(child, depth));
      }
    }
    return found;
  };

  const root = getNode(scene, nodeId);
  const tree = collect(root, 0);
  return { root: { name: root.name, type: root.type, node_id: nodeId }, instances: tree };
}

/** Component definition, looked up by node_id or by componentKey. */
export function componentDefinition(scene, { node_id, component_key }) {
  let owner = null;
  if (node_id) owner = getNode(scene, node_id);
  if (!owner && component_key) {
    for (const node of scene.nodes.values()) {
      if (node.componentKey === component_key) {
        owner = node;
        break;
      }
    }
  }
  if (!owner) {
    throw new Error(
      'That component is not in the loaded scene. Copy the component itself, or its variant set, with ⌘C.'
    );
  }

  // For a variant, climb to the set that owns the properties.
  const parent = scene.nodes.get(key(owner.parentIndex && owner.parentIndex.guid));
  if (parent && parent.isStateGroup) owner = parent;

  const properties = (owner.componentPropDefs || []).map((def) => ({
    name: def.name,
    type: def.type,
    default:
      (def.initialValue && def.initialValue.textValue && def.initialValue.textValue.characters) ??
      (def.initialValue && def.initialValue.boolValue) ??
      null,
    id: key(def.id),
  }));

  const variants = owner.isStateGroup
    ? childrenOf(scene, owner)
        .filter((child) => child.type === 'SYMBOL')
        .map((child) => {
          const propNames = new Map(
            (owner.componentPropDefs || []).map((def) => [key(def.id), def.name])
          );
          const values = {};
          for (const spec of child.variantPropSpecs || []) {
            values[propNames.get(key(spec.propDefId)) || 'variant'] = spec.value;
          }
          return { name: child.name, node_id: key(child.guid), values };
        })
    : [];

  return {
    name: owner.name,
    type: owner.type,
    node_id: key(owner.guid),
    key: owner.componentKey || null,
    remote: Boolean(owner.sourceLibraryKey),
    description: owner.description || null,
    properties,
    variants,
    layers: layerTree(scene, key(owner.guid), 3),
  };
}

/** Variables (design tokens) present in the scene. */
export function listVariables(scene) {
  const setsByGuid = new Map();
  const setsByKey = new Map();
  const namesByKey = new Map();
  for (const node of scene.nodes.values()) {
    if (node.type === 'VARIABLE_SET') {
      setsByGuid.set(key(node.guid), node.name);
      if (node.key) setsByKey.set(node.key, node.name);
    }
    if (node.type === 'VARIABLE' && node.key) namesByKey.set(node.key, node.name);
  }

  const variables = [];
  for (const node of scene.nodes.values()) {
    if (node.type !== 'VARIABLE') continue;

    const values = [];
    for (const entry of (node.variableDataValues && node.variableDataValues.entries) || []) {
      const data = entry.variableData || {};
      const raw = data.value || {};
      const aliasKey = assetKey(raw.alias);
      const value = aliasKey
        ? `→ ${namesByKey.get(aliasKey) || aliasKey}`
        : ((raw.colorValue && hex(raw.colorValue)) ??
          raw.floatValue ??
          raw.boolValue ??
          (raw.textValue && raw.textValue.characters) ??
          null);
      values.push({ mode: key(entry.modeID), value, type: data.resolvedDataType });
    }

    const setRef = node.variableSetID;
    variables.push({
      name: node.name,
      node_id: key(node.guid),
      set: setsByGuid.get(key(setRef)) || setsByKey.get(assetKey(setRef)) || null,
      type: node.variableResolvedType,
      key: node.key || null,
      values,
    });
  }
  return variables;
}
