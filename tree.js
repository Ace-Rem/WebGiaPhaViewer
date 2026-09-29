import { getMemberImagePath } from './member-image.js';
import { getFamilySurname, getMemberSurname, isBiologicalMember, isInFamily, isInLawMember, resolveFamilyRoles } from './sibling-role.js';

export { getFamilySurname, getMemberSurname, isBiologicalMember, isInFamily, isInLawMember, resolveFamilyRoles };

const CARD_WIDTH = 204;
const CARD_HEIGHT = 112;
const UNIT_GAP = 58;
const SIBLING_GAP = 18;
const ROW_GAP = 132;
const OUTER_PAD = 100;

const FAMILY_PALETTE = ['#c88c62', '#79a494', '#8b9fbd', '#b08b9e', '#b1a36e', '#7fa8a4', '#bb7e73', '#9989b5', '#c19a72', '#6f9d8d', '#a88c82', '#8998aa'];
const familyColorAssignments = new Map();
const familyColorOwners = new Map();
const stableHash = (value) => [...String(value)].reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0) >>> 0;
function getFamilyColor(familyId) {
  if (familyColorAssignments.has(familyId)) return familyColorAssignments.get(familyId);
  const start = stableHash(familyId) % FAMILY_PALETTE.length;
  let color = FAMILY_PALETTE[start];
  for (let offset = 0; offset < FAMILY_PALETTE.length; offset += 1) {
    const candidate = FAMILY_PALETTE[(start + offset) % FAMILY_PALETTE.length];
    const owner = familyColorOwners.get(candidate);
    if (!owner || owner === familyId) {
      color = candidate;
      break;
    }
  }
  familyColorAssignments.set(familyId, color);
  familyColorOwners.set(color, familyId);
  return color;
}

const escapeXml = (value = '') => String(value).replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase() || '?';
const splitName = (name = '') => {
  const words = name.trim().split(/\s+/);
  if (name.length <= 22 || words.length < 3) return [name];
  const pivot = Math.ceil(words.length / 2);
  return [words.slice(0, pivot).join(' '), words.slice(pivot).join(' ')];
};
const year = (date) => date ? String(date).slice(0, 4) : '';
const lifeDates = (person) => {
  const birth = year(person.birthDate);
  const death = year(person.deathDate);
  if (!birth && !death) return 'Chưa rõ năm sinh';
  if (birth && death) return `${birth} — ${death}`;
  return `${birth} — nay`;
};

export function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase().trim();
}

export function getSiblingOrder(member) {
  const order = member?.siblingOrder;
  return Number.isInteger(order) && order > 0 ? order : null;
}

export function buildFamilyGraph(data) {
  const members = data.members.map((member) => ({ ...member, spouseIds: Array.isArray(member.spouseIds) ? [...new Set(member.spouseIds)] : [], siblingIds: Array.isArray(member.siblingIds) ? [...new Set(member.siblingIds)] : [] }));
  const byId = new Map(members.map((member) => [member.id, member]));
  const familyRoleResolution = resolveFamilyRoles(members);
  const childrenByParent = new Map(members.map((member) => [member.id, []]));
  const parentIds = new Map();
  members.forEach((member) => {
    const parents = [member.fatherId, member.motherId].filter((id) => id && byId.has(id));
    parentIds.set(member.id, parents);
    parents.forEach((parentId) => childrenByParent.get(parentId).push(member.id));
  });
  const unitRelatedIds = new Map(members.map((member) => [member.id, new Set()]));
  const linkUnitMembers = (leftId, rightId) => {
    if (!leftId || !rightId || leftId === rightId || !byId.has(leftId) || !byId.has(rightId)) return;
    unitRelatedIds.get(leftId).add(rightId);
    unitRelatedIds.get(rightId).add(leftId);
  };
  members.forEach((member) => member.spouseIds.forEach((spouseId) => linkUnitMembers(member.id, spouseId)));
  members.forEach((member) => {
    const parents = parentIds.get(member.id) || [];
    for (let index = 0; index < parents.length; index += 1) {
      for (let next = index + 1; next < parents.length; next += 1) linkUnitMembers(parents[index], parents[next]);
    }
  });
  const biologicalChildrenByParent = new Map([...childrenByParent].map(([parentId, childIds]) => [parentId, childIds.filter((childId) => isBiologicalMember(byId.get(childId), familyRoleResolution))]));
  const siblingsByMember = new Map(members.map((member) => [member.id, new Set()]));
  const addSibling = (leftId, rightId) => {
    if (!leftId || !rightId || leftId === rightId || !byId.has(leftId) || !byId.has(rightId) || !isBiologicalMember(byId.get(leftId), familyRoleResolution) || !isBiologicalMember(byId.get(rightId), familyRoleResolution)) return;
    siblingsByMember.get(leftId).add(rightId);
    siblingsByMember.get(rightId).add(leftId);
  };
  members.forEach((member) => member.siblingIds.forEach((siblingId) => addSibling(member.id, siblingId)));
  biologicalChildrenByParent.forEach((children) => children.forEach((childId, index) => children.slice(index + 1).forEach((siblingId) => addSibling(childId, siblingId))));
  const siblingGroupByMember = new Map();
  let siblingGroupIndex = 0;
  members.forEach((member) => {
    if (siblingGroupByMember.has(member.id)) return;
    const queue = [member.id];
    siblingGroupByMember.set(member.id, siblingGroupIndex);
    while (queue.length) {
      const currentId = queue.shift();
      (siblingsByMember.get(currentId) || []).forEach((siblingId) => {
        if (!siblingGroupByMember.has(siblingId) && byId.has(siblingId)) {
          siblingGroupByMember.set(siblingId, siblingGroupIndex);
          queue.push(siblingId);
        }
      });
    }
    siblingGroupIndex += 1;
  });
  const memberIndex = new Map(members.map((member, index) => [member.id, index]));
  const parentSiblingOrder = (member) => {
    const orders = (parentIds.get(member.id) || []).map((parentId) => getSiblingOrder(byId.get(parentId))).filter((order) => order !== null);
    return orders.length ? Math.max(...orders) : null;
  };
  const compareAscendingOrder = (leftOrder, rightOrder) => {
    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (leftOrder !== null && rightOrder === null) return -1;
    if (leftOrder === null && rightOrder !== null) return 1;
    return 0;
  };
  const familyMemberIds = getFamilyMemberIds({ members, byId, biologicalChildrenByParent, childrenByParent }, data.family);
  const partnerPriority = (member) => familyMemberIds.has(member.id) ? 0 : 1;
  const comparePartnerMembers = (left, right) => partnerPriority(left) - partnerPriority(right) || memberIndex.get(left.id) - memberIndex.get(right.id);
  const compareLayoutPaths = (leftPath, rightPath) => {
    const length = Math.max(leftPath.length, rightPath.length);
    for (let index = 0; index < length; index += 1) {
      const leftOrder = leftPath[index] ?? null;
      const rightOrder = rightPath[index] ?? null;
      const difference = compareAscendingOrder(leftOrder, rightOrder);
      if (difference) return difference;
    }
    return 0;
  };
  const layoutPathCache = new Map();
  const layoutPathFor = (member, resolving = new Set()) => {
    if (layoutPathCache.has(member.id)) return layoutPathCache.get(member.id);
    if (resolving.has(member.id)) return [];
    const nextResolving = new Set(resolving).add(member.id);
    const familyParents = (parentIds.get(member.id) || []).map((parentId) => byId.get(parentId)).filter((parent) => parent && familyMemberIds.has(parent.id));
    const parentPaths = familyParents.map((parent) => layoutPathFor(parent, nextResolving));
    const parentPath = parentPaths.length ? parentPaths.sort(compareLayoutPaths)[0] : [];
    const path = [...parentPath, getSiblingOrder(member)];
    layoutPathCache.set(member.id, path);
    return path;
  };
  const compareMembers = (left, right) => {
    const pathDifference = compareLayoutPaths(layoutPathFor(left), layoutPathFor(right));
    if (pathDifference) return pathDifference;
    const groupDifference = siblingGroupByMember.get(left.id) - siblingGroupByMember.get(right.id);
    if (groupDifference) return groupDifference;
    return (memberIndex.get(left.id) - memberIndex.get(right.id)) || left.fullName.localeCompare(right.fullName, "vi");
  };
  childrenByParent.forEach((children) => children.sort((leftId, rightId) => compareMembers(byId.get(leftId), byId.get(rightId))));
  const generations = new Map();
  const resolving = new Set();
  const resolveGeneration = (id) => {
    if (generations.has(id)) return generations.get(id);
    if (resolving.has(id)) return 0;
    const declaredGeneration = byId.get(id)?.generation;
    if (Number.isInteger(declaredGeneration) && declaredGeneration > 0) {
      const generation = declaredGeneration - 1;
      generations.set(id, generation);
      return generation;
    }
    resolving.add(id);
    const generation = Math.max(0, ...(parentIds.get(id) || []).map((parentId) => resolveGeneration(parentId) + 1));
    resolving.delete(id);
    generations.set(id, generation);
    return generation;
  };
  members.forEach((member) => resolveGeneration(member.id));

  const byGeneration = new Map();
  members.forEach((member) => {
    const generation = generations.get(member.id);
    if (!byGeneration.has(generation)) byGeneration.set(generation, []);
    byGeneration.get(generation).push(member);
  });

  const units = [];
  const seen = new Set();
  [...byGeneration.keys()].sort((a, b) => a - b).forEach((generation) => {
    const generationMembers = byGeneration.get(generation).sort(compareMembers);
    generationMembers.forEach((member) => {
      if (seen.has(member.id)) return;
      const unitMembers = [member];
      seen.add(member.id);
      (unitRelatedIds.get(member.id) || new Set()).forEach((relatedId) => {
        const related = byId.get(relatedId);
        if (related && generations.get(related.id) === generation && !seen.has(related.id)) {
          unitMembers.push(related);
          seen.add(related.id);
        }
      });
      unitMembers.sort(comparePartnerMembers);
      units.push({ generation, members: unitMembers, width: unitMembers.length * CARD_WIDTH + (unitMembers.length - 1) * 14 });
    });
  });
  const unitAnchor = (unit) => [...unit.members].sort((left, right) => {
    const familyDifference = Number(!familyMemberIds.has(left.id)) - Number(!familyMemberIds.has(right.id));
    if (familyDifference) return familyDifference;
    const pathDifference = compareLayoutPaths(layoutPathFor(left), layoutPathFor(right));
    if (pathDifference) return pathDifference;
    return memberIndex.get(left.id) - memberIndex.get(right.id);
  })[0];
  const compareFamilyUnits = (left, right) => compareMembers(unitAnchor(left), unitAnchor(right));
  units.sort((left, right) => left.generation - right.generation || compareFamilyUnits(left, right));

  const maxGeneration = Math.max(...generations.values(), 0);
  const unitByMember = new Map();
  const unitKey = (unit) => unit.members.map((member) => member.id).sort().join('|');
  units.forEach((unit) => unit.members.forEach((member) => unitByMember.set(member.id, unit)));
  const childUnitsByUnit = new Map(units.map((unit) => [unit, new Set()]));
  units.forEach((unit) => unit.members.forEach((member) => (childrenByParent.get(member.id) || []).forEach((childId) => {
    const childUnit = unitByMember.get(childId);
    if (childUnit && childUnit !== unit) childUnitsByUnit.get(unit).add(childUnit);
  })));
  const branchWidthFor = (unit, resolving = new Set()) => {
    if (unit.branchWidth) return unit.branchWidth;
    if (resolving.has(unit)) return unit.width;
    const nextResolving = new Set(resolving).add(unit);
    const childUnits = [...(childUnitsByUnit.get(unit) || [])];
    const childrenWidth = childUnits.reduce((sum, childUnit) => sum + branchWidthFor(childUnit, nextResolving), 0) + Math.max(0, childUnits.length - 1) * UNIT_GAP;
    unit.branchWidth = Math.max(unit.width, childrenWidth);
    unit.layoutWidth = unit.width;
    return unit.branchWidth;
  };
  units.forEach((unit) => branchWidthFor(unit));
  const familyGroups = new Map();
  members.forEach((child) => {
    const parentUnits = [...new Map((parentIds.get(child.id) || []).map((parentId) => {
      const unit = unitByMember.get(parentId);
      return unit ? [unitKey(unit), unit] : null;
    }).filter(Boolean))].map(([, unit]) => unit);
    if (!parentUnits.length) return;
    const parentUnitIds = parentUnits.map(unitKey).sort();
    const parentGeneration = Math.min(...parentUnits.map((unit) => unit.generation));
    const familyId = parentUnitIds.join('|');
    const key = `${parentGeneration}:${familyId}`;
    if (!familyGroups.has(key)) familyGroups.set(key, { key, familyId, parentGeneration, parentUnitIds, parentUnits, childIds: new Set() });
    familyGroups.get(key).childIds.add(child.id);
  });
  const familyGroupsByGeneration = new Map();
  familyGroups.forEach((group) => {
    if (!familyGroupsByGeneration.has(group.parentGeneration)) familyGroupsByGeneration.set(group.parentGeneration, []);
    familyGroupsByGeneration.get(group.parentGeneration).push(group);
  });
  const LANE_TOP = 14;
  const LANE_GAP = 14;
  const rowGapByGeneration = new Map();
  for (let generation = 0; generation < maxGeneration; generation += 1) {
    const laneCount = familyGroupsByGeneration.get(generation)?.length || 0;
    const requiredGap = laneCount ? LANE_TOP + Math.max(0, laneCount - 1) * LANE_GAP + 20 : 0;
    rowGapByGeneration.set(generation, Math.max(ROW_GAP, requiredGap));
  }
  const rowY = new Map();
  let nextRowY = OUTER_PAD;
  for (let generation = 0; generation <= maxGeneration; generation += 1) {
    rowY.set(generation, nextRowY);
    nextRowY += CARD_HEIGHT + (rowGapByGeneration.get(generation) || ROW_GAP);
  }
  const rows = new Map();
  for (let generation = 0; generation <= maxGeneration; generation += 1) rows.set(generation, units.filter((unit) => unit.generation === generation));
  const unitSiblingGroup = (unit) => siblingGroupByMember.get(unitAnchor(unit).id);
  const gapBetweenUnits = (left, right) => {
    const leftGroup = unitSiblingGroup(left);
    const rightGroup = unitSiblingGroup(right);
    return leftGroup !== undefined && leftGroup === rightGroup ? SIBLING_GAP : UNIT_GAP;
  };
  const rowWidthFor = (row) => row.reduce((width, unit, index) => {
    const nextUnit = row[index + 1];
    return width + unit.layoutWidth + (nextUnit ? gapBetweenUnits(unit, nextUnit) : 0);
  }, 0);
  const rowWidths = new Map([...rows].map(([generation, row]) => [generation, rowWidthFor(row)]));
  const maxRowWidth = Math.max(...rowWidths.values(), 0);
  const contentWidth = Math.max(...rowWidths.values(), 0);
  const width = Math.max(940, contentWidth + OUTER_PAD * 2);
  const nodes = new Map();
  rows.forEach((row, generation) => {
    row.sort(compareFamilyUnits);
    let x = OUTER_PAD + (maxRowWidth - rowWidths.get(generation)) / 2;
    row.forEach((unit, index) => {
      const unitOffset = (unit.layoutWidth - unit.width) / 2;
      unit.members.forEach((member, index) => {
        const y = rowY.get(generation);
        const memberX = x + unitOffset + index * (CARD_WIDTH + 14);
        nodes.set(member.id, { member, id: member.id, generation, x: memberX, y, width: CARD_WIDTH, height: CARD_HEIGHT, centerX: memberX + CARD_WIDTH / 2, centerY: y + CARD_HEIGHT / 2 });
      });
      const nextUnit = row[index + 1];
      x += unit.layoutWidth + (nextUnit ? gapBetweenUnits(unit, nextUnit) : 0);
    });
  });
  const familyGroupLane = new Map();
  const groupBusRange = (group) => {
    const parentCenters = group.parentUnits.flatMap((unit) => unit.members.map((member) => nodes.get(member.id)?.centerX).filter((center) => center !== undefined));
    const childCenters = [...group.childIds].map((childId) => nodes.get(childId)?.centerX).filter((center) => center !== undefined);
    if (!parentCenters.length || !childCenters.length) return [0, 0];
    const parentStemX = (Math.min(...parentCenters) + Math.max(...parentCenters)) / 2;
    const centers = [parentStemX, ...childCenters];
    return [Math.min(...centers), Math.max(...centers)];
  };
  familyGroupsByGeneration.forEach((groups) => {
    const laneEnds = [];
    groups.sort((left, right) => groupBusRange(left)[0] - groupBusRange(right)[0] || left.key.localeCompare(right.key));
    groups.forEach((group) => {
      const [left, right] = groupBusRange(group);
      let lane = 0;
      while (laneEnds[lane] !== undefined && laneEnds[lane] + 12 >= left) lane += 1;
      familyGroupLane.set(group.key, lane);
      laneEnds[lane] = right;
    });
  });
  const familyColorById = new Map();
  familyGroups.forEach((group) => {
    group.familyColor = getFamilyColor(group.familyId);
    familyColorById.set(group.familyId, group.familyColor);
  });
  const height = (rowY.get(maxGeneration) || OUTER_PAD) + CARD_HEIGHT + OUTER_PAD;
  const edges = [];
  const familyLaneY = (group) => rowY.get(group.parentGeneration) + CARD_HEIGHT + LANE_TOP + (familyGroupLane.get(group.key) || 0) * LANE_GAP;
  familyGroups.forEach((group) => {
    const parentNodes = group.parentUnits.flatMap((unit) => unit.members.map((member) => nodes.get(member.id)).filter(Boolean));
    const childNodes = [...group.childIds].map((childId) => nodes.get(childId)).filter(Boolean);
    if (!parentNodes.length || !childNodes.length) return;
    const parentLeft = Math.min(...parentNodes.map((node) => node.centerX));
    const parentRight = Math.max(...parentNodes.map((node) => node.centerX));
    const parentStemX = (parentLeft + parentRight) / 2;
    const childLeft = Math.min(...childNodes.map((node) => node.centerX));
    const childRight = Math.max(...childNodes.map((node) => node.centerX));
    const busY = familyLaneY(group);
    const busLeft = Math.min(parentStemX, childLeft);
    const busRight = Math.max(parentStemX, childRight);
    const parentBottom = Math.max(...parentNodes.map((node) => node.y + CARD_HEIGHT));
    const parentLinkY = parentBottom + 12;
    const parentIdsForEdge = parentNodes.map((node) => node.id).join(',');
    const childIdsForEdge = childNodes.map((node) => node.id).join(',');
    const trunk = parentNodes.length > 1
      ? `M ${parentLeft} ${parentBottom} V ${parentLinkY} H ${parentRight} M ${parentStemX} ${parentLinkY} V ${busY}`
      : `M ${parentStemX} ${parentBottom} V ${busY}`;
    edges.push({ type: 'parent', id: `family-bus-${group.key}`, familyId: group.familyId, familyColor: group.familyColor, from: parentIdsForEdge, to: childIdsForEdge, path: `${trunk} M ${busLeft} ${busY} H ${busRight}` });
    childNodes.forEach((childNode) => {
      const childParents = parentIds.get(childNode.id) || [];
      edges.push({ type: 'parent', id: `parent-${group.key}-${childNode.id}`, familyId: group.familyId, familyColor: group.familyColor, from: childParents.join(','), to: childNode.id, path: `M ${childNode.centerX} ${busY} V ${childNode.y}` });
    });
  });
  members.forEach((member) => {
    member.spouseIds.forEach((spouseId) => {
      if (member.id < spouseId && nodes.has(spouseId) && nodes.get(member.id).generation === nodes.get(spouseId).generation) edges.push({ type: 'spouse', id: `spouse-${member.id}-${spouseId}`, from: member.id, to: spouseId, path: `M ${nodes.get(member.id).x + CARD_WIDTH} ${nodes.get(member.id).centerY} H ${nodes.get(spouseId).x}` });
    });
  });
  siblingsByMember.forEach((siblingIds, memberId) => siblingIds.forEach((siblingId) => {
    if (memberId < siblingId && nodes.has(siblingId) && nodes.get(memberId).generation === nodes.get(siblingId).generation) {
      const left = nodes.get(memberId).centerX < nodes.get(siblingId).centerX ? nodes.get(memberId) : nodes.get(siblingId);
      const right = left.id === memberId ? nodes.get(siblingId) : nodes.get(memberId);
      edges.push({ type: 'sibling', id: `sibling-${left.id}-${right.id}`, from: left.id, to: right.id, path: `M ${left.x + CARD_WIDTH / 2} ${left.y - 8} V ${left.y - 20} H ${right.x + CARD_WIDTH / 2} V ${right.y - 8}` });
    }
  }));
  return { members, byId, parentIds, familyRoles: familyRoleResolution.byId, ambiguousFamilyRoleIds: familyRoleResolution.ambiguousIds, childrenByParent, biologicalChildrenByParent, siblingsByMember, siblingGroupByMember, familyColorById, generations, nodes, edges, width, height, maxGeneration, rowY, rowGapByGeneration };
}

function collectDescendantIds(childrenByParent, rootIds = []) {
  const descendants = new Set();
  const queue = [...rootIds];
  while (queue.length) {
    const parentId = queue.shift();
    (childrenByParent.get(parentId) || []).forEach((childId) => {
      if (descendants.has(childId)) return;
      descendants.add(childId);
      queue.push(childId);
    });
  }
  return descendants;
}

export function relationSets(graph, personId) {
  const ancestors = new Set();
  const visitParents = (id) => (graph.parentIds.get(id) || []).forEach((parentId) => { if (!ancestors.has(parentId)) { ancestors.add(parentId); visitParents(parentId); } });
  visitParents(personId);
  return { ancestors, descendants: collectDescendantIds(graph.childrenByParent, [personId]) };
}

export function getFamilyMemberIds(graph, family = {}) {
  return new Set((graph.members || []).filter((member) => isInFamily(member, family)).map((member) => member.id));
}

export class TreeRenderer {
  constructor(svg, viewport, onSelect, onOpen = onSelect, onTransform = () => {}) {
    this.svg = svg;
    this.viewport = viewport;
    this.onSelect = onSelect;
    this.onOpen = onOpen;
    this.onTransform = onTransform;
    this.graph = null;
    this.selectedId = null;
    this.focusIds = null;
    this.filterIds = null;
    this.mode = 'all';
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.activeGeneration = null;
    this.animationFrame = null;
    this.cameraTransitionId = 0;
    this.cameraTarget = null;
    this.viewWidth = 800;
    this.viewHeight = 600;
    this.pointerMap = new Map();
    this.dragStart = null;
    this.didDrag = false;
    this.suppressClick = false;
    this.lastTap = null;
    this.tapTarget = null;
    this.eventController = new AbortController();
    this.resizeHandler = null;
    this.bindPointerEvents();
  }

  render(graph, selectedId = null, focusIds = null, filterIds = null) {
    this.graph = graph;
    this.selectedId = selectedId;
    this.focusIds = focusIds;
    this.filterIds = filterIds;
    this.svg.setAttribute('viewBox', `0 0 ${this.viewWidth} ${this.viewHeight}`);
    const edgeMarkup = graph.edges.map((edge) => {
      const familyStyle = edge.familyColor ? ` style="--family-color:${escapeXml(edge.familyColor)}"` : '';
      return `<path class="tree-edge ${edge.type}" data-edge-from="${escapeXml(edge.from)}" data-edge-to="${escapeXml(edge.to)}"${familyStyle} d="${edge.path}" />`;
    }).join('');
    const bandMarkup = Array.from({ length: graph.maxGeneration + 1 }, (_, generation) => {
      const y = graph.rowY?.get(generation) ?? (OUTER_PAD + generation * (CARD_HEIGHT + ROW_GAP));
      return `<rect class="generation-band" data-generation="${generation}" x="${OUTER_PAD - 28}" y="${y - 20}" width="${Math.max(0, graph.width - OUTER_PAD * 2 + 56)}" height="${CARD_HEIGHT + 40}" rx="24" />`;
    }).join('');
    const nodeMarkup = [...graph.nodes.values()].map((node) => this.nodeMarkup(node)).join('');
    this.svg.innerHTML = `<g class="tree-world"><g class="tree-bands">${bandMarkup}</g><g class="tree-edges">${edgeMarkup}</g><g class="tree-nodes">${nodeMarkup}</g></g>`;
    this.wirePhotoFallbacks();
    this.applyTransform();
  }

  nodeMarkup(node) {
    const { member } = node;
    const classes = ['tree-node'];
    const isSelected = member.id === this.selectedId;
    const matchesLineage = !this.focusIds || this.focusIds.has(member.id);
    const matchesFilter = !this.filterIds || this.filterIds.has(member.id);
    if (isSelected) classes.push('selected');
    if (this.filterIds && matchesFilter) classes.push('filter-match');
    if (!isSelected && (!matchesLineage || !matchesFilter)) classes.push('dimmed');
    else if (!isSelected && ((this.focusIds && matchesLineage) || (this.filterIds && matchesFilter))) classes.push('related');
    const nameLines = splitName(member.fullName);
    const nameMarkup = nameLines.map((line, index) => `<text class="node-name" x="64" y="${30 + index * 15}">${escapeXml(line)}</text>`).join('');
    const siblingOrder = getSiblingOrder(member);
    const siblingOrderMarkup = siblingOrder ? `<g class="sibling-order-badge" aria-hidden="true"><circle cx="186" cy="17.5" r="9"/><text x="186" y="18">${escapeXml(siblingOrder)}</text></g>` : '';
    const role = member.occupation || (member.gender === 'female' ? 'Thành viên nữ' : member.gender === 'male' ? 'Thành viên nam' : 'Thành viên gia đình');
    const imagePath = getMemberImagePath(member);
    const imageMarkup = imagePath ? `<image class="node-photo" data-member-photo x="9" y="10" width="42" height="42" preserveAspectRatio="xMidYMid slice" href="${escapeXml(imagePath)}" aria-hidden="true"/>` : '';
    return `<g class="${classes.join(' ')}" data-person-id="${escapeXml(member.id)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button" aria-label="Mở hồ sơ ${escapeXml(member.fullName)}"><rect class="node-card" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="16"/>${siblingOrderMarkup}<circle class="node-avatar" cx="30" cy="31" r="21"/><text class="node-avatar-text" x="30" y="31">${escapeXml(initials(member.fullName))}</text>${imageMarkup}${nameMarkup}<text class="node-date" x="64" y="${nameLines.length > 1 ? 65 : 50}">${escapeXml(lifeDates(member))}</text><text class="node-role" x="64" y="${nameLines.length > 1 ? 85 : 70}">${escapeXml(role.length > 23 ? `${role.slice(0, 22)}…` : role)}</text><path d="M20 95h168" stroke="currentColor" stroke-opacity=".08"/><circle cx="187" cy="95" r="3" fill="${member.deathDate ? 'var(--copper)' : '#79a278'}"/></g>`;
  }

  wirePhotoFallbacks() {
    this.svg.querySelectorAll('[data-member-photo]').forEach((image) => {
      image.addEventListener('load', () => image.classList.add('loaded'), { once: true });
      image.addEventListener('error', () => {
        image.removeAttribute('href');
        image.classList.add('failed');
      }, { once: true });
      if (image.complete && image.width?.baseVal?.value) image.classList.add('loaded');
    });
  }

  updateFocus(selectedId, focusIds) {
    this.selectedId = selectedId;
    this.focusIds = focusIds;
    this.applyVisualState();
  }

  setFilter(filterIds) {
    this.filterIds = filterIds instanceof Set ? filterIds : null;
    this.applyVisualState();
  }

  applyVisualState() {
    const { selectedId, focusIds, filterIds } = this;
    this.svg.querySelectorAll('.tree-node').forEach((node) => {
      const isSelected = node.dataset.personId === selectedId;
      const matchesLineage = !focusIds || focusIds.has(node.dataset.personId);
      const matchesFilter = !filterIds || filterIds.has(node.dataset.personId);
      const isVisible = isSelected || (matchesLineage && matchesFilter);
      node.classList.toggle('selected', isSelected);
      node.classList.toggle('filter-match', Boolean(filterIds && matchesFilter));
      node.classList.toggle('dimmed', !isVisible);
      node.classList.toggle('related', Boolean(!isSelected && ((focusIds && matchesLineage) || (filterIds && matchesFilter))));
    });
    this.svg.querySelectorAll('.tree-edge').forEach((edge) => {
      const edgePeople = `${edge.dataset.edgeFrom},${edge.dataset.edgeTo}`.split(',');
      const relatedByLineage = Boolean(focusIds && edgePeople.some((id) => focusIds.has(id)));
      const relatedByFilter = Boolean(filterIds && edgePeople.some((id) => filterIds.has(id)));
      const related = Boolean(edgePeople.some((id) => id === selectedId) || relatedByLineage || relatedByFilter);
      const filtering = Boolean(focusIds || filterIds);
      edge.classList.toggle('dimmed', filtering && !related);
      edge.classList.toggle('related', related);
      edge.classList.toggle('filter-related', Boolean(filterIds && relatedByFilter));
    });
  }

  setActiveGeneration(generation) {
    this.activeGeneration = generation === null || generation === undefined ? null : Number(generation);
    this.svg.querySelectorAll('.generation-band').forEach((band) => band.classList.toggle('active', Number(band.dataset.generation) === this.activeGeneration));
    this.onTransform({ type: 'generation', generation: this.activeGeneration });
  }

  getContentBounds() {
    const nodes = [...(this.graph?.nodes.values() || [])];
    if (!nodes.length) return { left: 0, top: 0, right: this.graph?.width || 0, bottom: this.graph?.height || 0 };
    const left = Math.min(...nodes.map((node) => node.x));
    const top = Math.min(...nodes.map((node) => node.y));
    const right = Math.max(...nodes.map((node) => node.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.y + node.height));
    return { left, top, right, bottom };
  }

  getCameraLimits(scale = this.scale) {
    const bounds = this.getContentBounds();
    const railInset = this.getRailInset();
    const leftEdge = railInset + 28;
    const rightEdge = Math.max(leftEdge + 1, this.viewWidth - 28);
    const centerX = (leftEdge + rightEdge) / 2;
    const centerY = this.viewHeight / 2;
    const horizontalRoom = Math.max(120, Math.min(220, (rightEdge - leftEdge) * .34));
    const verticalRoom = Math.max(100, Math.min(180, this.viewHeight * .28));
    return {
      minTx: centerX - bounds.right * scale - horizontalRoom,
      maxTx: centerX - bounds.left * scale + horizontalRoom,
      minTy: centerY - bounds.bottom * scale - verticalRoom,
      maxTy: centerY - bounds.top * scale + verticalRoom,
    };
  }

  clampCamera(tx, ty, scale = this.scale) {
    const limits = this.getCameraLimits(scale);
    return {
      tx: Math.min(limits.maxTx, Math.max(limits.minTx, tx)),
      ty: Math.min(limits.maxTy, Math.max(limits.minTy, ty)),
    };
  }

  getGenerationBounds(generation) {
    const nodes = [...(this.graph?.nodes.values() || [])].filter((node) => node.generation === Number(generation));
    if (!nodes.length) return null;
    const left = Math.min(...nodes.map((node) => node.x));
    const top = Math.min(...nodes.map((node) => node.y));
    const right = Math.max(...nodes.map((node) => node.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.y + node.height));
    return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
  }

  getGenerationRailMetrics() {
    const positions = Array.from({ length: (this.graph?.maxGeneration || 0) + 1 }, (_, generation) => {
      const y = this.graph?.rowY?.get(generation) ?? (OUTER_PAD + generation * (CARD_HEIGHT + ROW_GAP));
      return { generation, top: this.ty + (y - 20) * this.scale, height: (CARD_HEIGHT + 40) * this.scale };
    });
    const generationCount = (this.graph?.maxGeneration || 0) + 1;
    return { positions, trackHeight: Math.max(this.viewHeight, this.graph ? this.graph.height * this.scale + 120 : this.viewHeight, generationCount * 68 + 20) };
  }

  setViewportSize() {
    const rect = this.viewport.getBoundingClientRect();
    this.viewWidth = Math.max(rect.width, 320);
    this.viewHeight = Math.max(rect.height - 57, 300);
    this.svg.setAttribute('viewBox', `0 0 ${this.viewWidth} ${this.viewHeight}`);
  }

  applyTransform() {
    const clamped = this.clampCamera(this.tx, this.ty, this.scale);
    this.tx = clamped.tx;
    this.ty = clamped.ty;
    this.svg.querySelector('.tree-world')?.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`);
    this.onTransform({ type: 'camera', tx: this.tx, ty: this.ty, scale: this.scale, viewWidth: this.viewWidth, viewHeight: this.viewHeight });
  }

  getRailInset() {
    return window.matchMedia?.('(max-width: 700px)').matches ? 56 : 94;
  }

  fit(animated = true) {
    if (!this.graph) return;
    this.setViewportSize();
    this.cancelCameraAnimation();
    const railInset = this.getRailInset();
    const usableWidth = this.viewWidth - 70 - railInset;
    const usableHeight = this.viewHeight - 60;
    const nextScale = Math.min(usableWidth / this.graph.width, usableHeight / this.graph.height, 1.05);
    const targetScale = Math.max(.32, nextScale);
    const targetTx = railInset + (this.viewWidth - railInset - this.graph.width * targetScale) / 2;
    const targetTy = (this.viewHeight - this.graph.height * targetScale) / 2;
    this.cameraTarget = null;
    this.setActiveGeneration(null);
    this.animateTransform(targetTx, targetTy, targetScale, animated);
  }

  centerOn(id, animated = true) {
    const node = this.graph?.nodes.get(id);
    if (!node) return;
    this.setViewportSize();
    const targetScale = Math.max(this.scale, Math.min(1.05, (this.viewWidth - this.getRailInset()) / (this.graph.width * .72)));
    const contentCenterX = this.getRailInset() + (this.viewWidth - this.getRailInset()) / 2;
    const targetTx = contentCenterX - node.centerX * targetScale;
    const targetTy = this.viewHeight / 2 - node.centerY * targetScale;
    this.cameraTarget = { type: 'person', id };
    this.setActiveGeneration(node.generation);
    this.animateTransform(targetTx, targetTy, targetScale, animated);
  }

  focusGeneration(generation, animated = true) {
    const bounds = this.getGenerationBounds(generation);
    if (!bounds) return;
    this.setViewportSize();
    const railInset = this.getRailInset();
    const contentWidth = this.viewWidth - railInset - 40;
    const contentHeight = this.viewHeight - 78;
    const targetScale = Math.max(.32, Math.min(1.15, Math.min(contentWidth / bounds.width, contentHeight / bounds.height)));
    const contentCenterX = railInset + (this.viewWidth - railInset) / 2;
    const targetTx = contentCenterX - bounds.centerX * targetScale;
    const targetTy = this.viewHeight / 2 - bounds.centerY * targetScale;
    this.cameraTarget = { type: 'generation', generation: Number(generation) };
    this.setActiveGeneration(generation);
    this.animateTransform(targetTx, targetTy, targetScale, animated);
  }

  cancelCameraAnimation(clearTarget = true) {
    this.cameraTransitionId += 1;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (clearTarget) this.cameraTarget = null;
  }

  animateTransform(targetTx, targetTy, targetScale, animated) {
    this.cancelCameraAnimation(false);
    const transitionId = this.cameraTransitionId;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animated || reduced) {
      this.tx = targetTx; this.ty = targetTy; this.scale = targetScale; this.cameraTarget = null; this.applyTransform(); return;
    }
    const start = { tx: this.tx, ty: this.ty, scale: this.scale };
    const startedAt = performance.now();
    const duration = 380;
    const tick = (now) => {
      if (transitionId !== this.cameraTransitionId) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.tx = start.tx + (targetTx - start.tx) * eased;
      this.ty = start.ty + (targetTy - start.ty) * eased;
      this.scale = start.scale + (targetScale - start.scale) * eased;
      this.applyTransform();
      if (progress < 1) this.animationFrame = requestAnimationFrame(tick);
      else { this.animationFrame = null; this.cameraTarget = null; }
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  zoomAt(factor, clientX = this.viewWidth / 2, clientY = this.viewHeight / 2) {
    this.cancelCameraAnimation();
    const nextScale = Math.min(1.7, Math.max(.22, this.scale * factor));
    const worldX = (clientX - this.tx) / this.scale;
    const worldY = (clientY - this.ty) / this.scale;
    this.tx = clientX - worldX * nextScale;
    this.ty = clientY - worldY * nextScale;
    this.scale = nextScale;
    this.applyTransform();
  }

  bindPointerEvents() {
    const signal = this.eventController.signal;
    this.svg.addEventListener('click', (event) => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      const node = event.target.closest?.('[data-person-id]');
      if (node) this.onSelect(node.dataset.personId);
    }, { signal });
    this.svg.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('[data-person-id]')) {
        event.preventDefault();
        this.onSelect(event.target.closest('[data-person-id]').dataset.personId);
      }
    }, { signal });
    this.svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cancelCameraAnimation();
      const rect = this.svg.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.viewWidth / rect.width);
      const y = (event.clientY - rect.top) * (this.viewHeight / rect.height);
      this.zoomAt(event.deltaY > 0 ? .9 : 1.1, x, y);
    }, { passive: false, signal });
    this.svg.addEventListener('pointerdown', (event) => {
      this.suppressClick = false;
      this.cancelCameraAnimation();
      this.svg.setPointerCapture(event.pointerId);
      this.tapTarget = event.target.closest?.('[data-person-id]') || null;
      this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointerMap.size === 1) this.dragStart = { x: event.clientX, y: event.clientY, tx: this.tx, ty: this.ty };
      if (this.pointerMap.size === 2) this.pinchStart = this.pinchState();
      this.didDrag = false;
      this.viewport.classList.add('is-dragging');
    }, { signal });
    this.svg.addEventListener('pointermove', (event) => {
      const previous = this.pointerMap.get(event.pointerId);
      if (!previous) return;
      this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointerMap.size >= 2) {
        this.didDrag = true;
        const pinch = this.pinchState();
        if (this.pinchStart) {
          const ratio = pinch.distance / this.pinchStart.distance;
          const rect = this.svg.getBoundingClientRect();
          const centerX = (pinch.x - rect.left) * (this.viewWidth / rect.width);
          const centerY = (pinch.y - rect.top) * (this.viewHeight / rect.height);
          this.scale = this.pinchStart.scale;
          this.tx = this.pinchStart.tx;
          this.ty = this.pinchStart.ty;
          this.zoomAt(ratio, centerX, centerY);
        }
        return;
      }
      if (!this.dragStart) return;
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.didDrag = true;
      const rect = this.svg.getBoundingClientRect();
      this.tx = this.dragStart.tx + dx * (this.viewWidth / rect.width);
      this.ty = this.dragStart.ty + dy * (this.viewHeight / rect.height);
      this.applyTransform();
    }, { signal });
    const finishPointer = (event) => {
      const wasSinglePointer = this.pointerMap.size === 1;
      const wasMultiPointer = this.pointerMap.size >= 2;
      const tapNode = this.tapTarget;
      const wasTap = wasSinglePointer && !this.didDrag && tapNode;
      if (wasTap) {
        const now = performance.now();
        if (this.lastTap && this.lastTap.id === tapNode.dataset.personId && now - this.lastTap.time < 360) {
          this.onOpen(tapNode.dataset.personId);
          this.lastTap = null;
        } else {
          this.lastTap = { id: tapNode.dataset.personId, time: now };
        }
      }
      if (this.didDrag) this.suppressClick = true;
      this.pointerMap.delete(event.pointerId);
      if (wasMultiPointer && this.pointerMap.size === 1) {
        const remaining = [...this.pointerMap.values()][0];
        this.dragStart = { x: remaining.x, y: remaining.y, tx: this.tx, ty: this.ty };
        this.pinchStart = null;
        this.tapTarget = null;
      } else if (this.pointerMap.size < 2) {
        this.pinchStart = null;
      }
      if (!this.pointerMap.size) { this.dragStart = null; this.tapTarget = null; this.viewport.classList.remove('is-dragging'); }
    };
    this.svg.addEventListener('pointerup', finishPointer, { signal });
    this.svg.addEventListener('pointercancel', finishPointer, { signal });
    this.svg.addEventListener('dblclick', (event) => {
      const node = event.target.closest?.('[data-person-id]');
      if (node) {
        event.preventDefault();
        event.stopPropagation();
        this.onOpen(node.dataset.personId);
        return;
      }
      const rect = this.svg.getBoundingClientRect();
      this.zoomAt(1.22, (event.clientX - rect.left) * (this.viewWidth / rect.width), (event.clientY - rect.top) * (this.viewHeight / rect.height));
    }, { signal });
    this.resizeHandler = () => { if (this.graph) { this.setViewportSize(); this.applyTransform(); } };
    window.addEventListener('resize', this.resizeHandler);
  }

  destroy() {
    this.cancelCameraAnimation();
    this.eventController.abort();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.pointerMap.clear();
  }

  pinchState() {
    const points = [...this.pointerMap.values()];
    const dx = points[0].x - points[1].x;
    const dy = points[0].y - points[1].y;
    return { distance: Math.hypot(dx, dy), x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, scale: this.scale, tx: this.tx, ty: this.ty };
  }
}

export { lifeDates, initials };
