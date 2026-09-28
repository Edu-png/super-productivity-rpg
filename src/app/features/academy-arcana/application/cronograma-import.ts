import { AcademyRepository } from '../domain/academy.repository';
import { StudyArea, StudyNode } from '../domain/academy.models';
import { CRONOGRAMA_CSV_RAW } from './cronograma-import.data';

const CRONOGRAMA_AREA_TITLE = 'Cronograma';
const DEVICE_ID = 'cronograma-import';

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  março: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

interface CronogramaRow {
  title: string;
  classe: string;
  dateRange: string;
  feito: boolean;
  link: string;
  month: string;
  platform: string;
  tema: string;
}

/**
 * Reverses the "UTF-8 bytes re-decoded as Latin-1" mojibake in the source
 * export (e.g. "MÃªs" -> "Mês") by re-encoding each char back to its
 * original byte value and decoding that byte sequence as UTF-8.
 */
const fixMojibake = (input: string): string => {
  try {
    const bytes = Uint8Array.from([...input].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return input;
  }
};

const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const parseFirstDate = (dateRange: string): Date | null => {
  const match = dateRange.match(/(\d{1,2}) de ([a-zçã]+) de (\d{4})/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthIndex = MONTH_NAME_TO_INDEX[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (monthIndex === undefined) return null;
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
};

const parseCsv = (raw: string): CronogramaRow[] => {
  const lines = raw
    .trim()
    .split('\n')
    .map((line) => line.trimEnd());
  const [, ...dataLines] = lines; // drop header
  return dataLines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cols = line.split(',').map((col) => fixMojibake(col.trim()));
      const [title, , classe, dateRange, feito, , link, month, platform, , tema] = cols;
      return {
        title,
        classe,
        dateRange,
        feito: feito === 'Yes',
        link,
        month,
        platform,
        tema,
      };
    })
    .filter((row) => row.title);
};

/**
 * One-time, idempotent seed of the "Cronograma" study area with the owner's
 * Notion study-schedule export. Safe to call on every load: stable,
 * deterministic node ids make re-running it a no-op upsert rather than a
 * duplicate insert, and the caller additionally gates it behind a
 * localStorage flag so it doesn't redo the work every session.
 */
export async function importCronogramaSchedule(
  repository: AcademyRepository,
  profileId: string,
): Promise<void> {
  const now = Date.now();
  const areas = await repository.listAreas(profileId);
  let area = areas.find(
    (candidate) =>
      candidate.title.trim().toLocaleLowerCase() ===
      CRONOGRAMA_AREA_TITLE.toLocaleLowerCase(),
  );
  if (!area) {
    area = {
      id: 'cronograma-area',
      profileId,
      title: CRONOGRAMA_AREA_TITLE,
      description: 'Cronograma de estudos importado do Notion.',
      color: '#d9a441',
      icon: 'event_note',
      coverUrl: null,
      position: areas.length,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deviceId: DEVICE_ID,
      deletedAt: null,
    } satisfies StudyArea;
    await repository.putArea(area);
  }
  const areaId = area.id;

  const rows = parseCsv(CRONOGRAMA_CSV_RAW);
  const existingNodes = await repository.listNodes(profileId, areaId);
  const existingIds = new Set(existingNodes.map((node) => node.id));

  const folderIdByMonth = new Map<string, string>();
  const folderPositionByMonth = new Map<string, number>();
  let monthOrder = 0;
  const nodesToWrite: StudyNode[] = [];

  for (const row of rows) {
    const monthKey = row.month || 'Sem mês';
    if (!folderIdByMonth.has(monthKey)) {
      const folderId = `cronograma-folder-${slugify(monthKey)}`;
      folderIdByMonth.set(monthKey, folderId);
      folderPositionByMonth.set(monthKey, monthOrder++);
      if (!existingIds.has(folderId)) {
        nodesToWrite.push({
          id: folderId,
          profileId,
          areaId,
          parentId: null,
          kind: 'folder',
          title: monthKey,
          description: '',
          notesMarkdown: '',
          links: [],
          drawing: null,
          color: area.color,
          icon: 'folder',
          coverUrl: null,
          position: folderPositionByMonth.get(monthKey) ?? 0,
          difficulty: 1,
          weight: 1,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
          deviceId: DEVICE_ID,
          deletedAt: null,
        });
      }
    }
  }

  const positionByFolder = new Map<string, number>();
  for (const row of rows) {
    const monthKey = row.month || 'Sem mês';
    const folderId = folderIdByMonth.get(monthKey) as string;
    const position = positionByFolder.get(folderId) ?? 0;
    positionByFolder.set(folderId, position + 1);

    const nodeId = `cronograma-topic-${slugify(monthKey)}-${slugify(row.title)}`;
    if (existingIds.has(nodeId)) continue;

    const descriptionParts = [row.classe, row.tema, row.platform].filter(Boolean);
    const completedDate = row.feito ? parseFirstDate(row.dateRange) : null;

    nodesToWrite.push({
      id: nodeId,
      profileId,
      areaId,
      parentId: folderId,
      kind: 'topic',
      title: row.title,
      description: descriptionParts.join(' · '),
      notesMarkdown: row.dateRange ? `Período: ${row.dateRange}` : '',
      links: row.link ? [{ label: row.platform || 'Link', url: row.link }] : [],
      drawing: null,
      color: area.color,
      icon: 'topic',
      coverUrl: null,
      position,
      difficulty: 3,
      weight: 1,
      completedAt: completedDate ? completedDate.getTime() : null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deviceId: DEVICE_ID,
      deletedAt: null,
    });
  }

  await Promise.all(nodesToWrite.map((node) => repository.putNode(node)));
}
