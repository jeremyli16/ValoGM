import type { RegionId } from '../types';
import { weightedChoice, randChoice } from './rng';
import type { Rng } from './rng';

export interface NationalityPool {
  nationality: string;
  region: RegionId;
  weight: number;
  firstNames: string[];
  lastNames: string[];
}

export const NATIONALITY_POOLS: NationalityPool[] = [
  // Americas
  {
    nationality: 'USA', region: 'americas', weight: 18,
    firstNames: ['Tyler', 'Jake', 'Brandon', 'Kyle', 'Austin', 'Jordan', 'Ryan', 'Trevor', 'Logan', 'Ethan'],
    lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'],
  },
  {
    nationality: 'Brazil', region: 'americas', weight: 14,
    firstNames: ['Gabriel', 'Felipe', 'Matheus', 'Lucas', 'Pedro', 'Vitor', 'Gustavo', 'Rafael', 'Caio', 'Igor'],
    lastNames: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento'],
  },
  {
    nationality: 'Canada', region: 'americas', weight: 5,
    firstNames: ['Liam', 'Noah', 'Oliver', 'Ethan', 'Connor', 'Aiden', 'Jackson', 'Mason', 'Lucas', 'James'],
    lastNames: ['Tremblay', 'Roy', 'Gagnon', 'Martin', 'Brown', 'Wilson', 'Anderson', 'Taylor', 'Moore', 'Clark'],
  },
  {
    nationality: 'Argentina', region: 'americas', weight: 4,
    firstNames: ['Tomás', 'Mateo', 'Santiago', 'Facundo', 'Agustín', 'Nicolás', 'Luca', 'Marco', 'Rodrigo', 'Bruno'],
    lastNames: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'García', 'Sánchez'],
  },
  {
    nationality: 'Chile', region: 'americas', weight: 3,
    firstNames: ['Cristóbal', 'Diego', 'Sebastián', 'Ignacio', 'Matías', 'Alejandro', 'Francisco', 'Tomás', 'Felipe', 'Nicolás'],
    lastNames: ['Muñoz', 'González', 'Rojas', 'Flores', 'Díaz', 'Morales', 'Torres', 'Contreras', 'Ramos', 'Herrera'],
  },

  // EMEA
  {
    nationality: 'France', region: 'emea', weight: 9,
    firstNames: ['Hugo', 'Théo', 'Louis', 'Nathan', 'Mathis', 'Clément', 'Antoine', 'Julien', 'Nicolas', 'Alexis'],
    lastNames: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau'],
  },
  {
    nationality: 'UK', region: 'emea', weight: 8,
    firstNames: ['Jack', 'Harry', 'George', 'Oscar', 'Charlie', 'Jacob', 'Alfie', 'Freddie', 'Archie', 'Oliver'],
    lastNames: ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Roberts'],
  },
  {
    nationality: 'Sweden', region: 'emea', weight: 7,
    firstNames: ['Linus', 'Erik', 'Oskar', 'Viktor', 'Johan', 'Pontus', 'Mattias', 'Jesper', 'Niklas', 'Marcus'],
    lastNames: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson'],
  },
  {
    nationality: 'Denmark', region: 'emea', weight: 6,
    firstNames: ['Mikkel', 'Rasmus', 'Jakob', 'Mathias', 'Tobias', 'Nicolai', 'Andreas', 'Jonas', 'Frederik', 'Magnus'],
    lastNames: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen'],
  },
  {
    nationality: 'Turkey', region: 'emea', weight: 6,
    firstNames: ['Emre', 'Burak', 'Kaan', 'Mert', 'Arda', 'Yusuf', 'Ahmet', 'Mehmet', 'Serhat', 'Ozan'],
    lastNames: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Doğan', 'Erdoğan', 'Arslan', 'Öztürk', 'Koç'],
  },
  {
    nationality: 'Poland', region: 'emea', weight: 5,
    firstNames: ['Michał', 'Jakub', 'Piotr', 'Mateusz', 'Kamil', 'Bartosz', 'Łukasz', 'Krzysztof', 'Tomasz', 'Szymon'],
    lastNames: ['Nowak', 'Kowalski', 'Wiśniewski', 'Dąbrowski', 'Kamińska', 'Kowalczyk', 'Zieliński', 'Szymański', 'Woźniak', 'Kozłowski'],
  },
  {
    nationality: 'Germany', region: 'emea', weight: 5,
    firstNames: ['Lukas', 'Jonas', 'Leon', 'Finn', 'Max', 'Niklas', 'Felix', 'Paul', 'Moritz', 'Jan'],
    lastNames: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hofmann'],
  },

  // Pacific
  {
    nationality: 'South Korea', region: 'pacific', weight: 20,
    firstNames: ['Minjun', 'Jaemin', 'Seongjun', 'Hyunjin', 'Seunghyun', 'Youngwoo', 'Donghyun', 'Jihoon', 'Taehyun', 'Junwoo'],
    lastNames: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim'],
  },
  {
    nationality: 'Japan', region: 'pacific', weight: 8,
    firstNames: ['Yuto', 'Ren', 'Haruto', 'Sota', 'Riku', 'Kaito', 'Sora', 'Daiki', 'Yuki', 'Takumi'],
    lastNames: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato'],
  },
  {
    nationality: 'Philippines', region: 'pacific', weight: 6,
    firstNames: ['Raphael', 'Jayson', 'Christian', 'Mark', 'John', 'Michael', 'Joshua', 'Lance', 'Carlo', 'Angelo'],
    lastNames: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Ramirez', 'Flores'],
  },
  {
    nationality: 'Australia', region: 'pacific', weight: 5,
    firstNames: ['Lachlan', 'Bailey', 'Zac', 'Cooper', 'Hunter', 'Flynn', 'Kai', 'Riley', 'Jake', 'Josh'],
    lastNames: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin', 'Thomas'],
  },
  {
    nationality: 'Thailand', region: 'pacific', weight: 4,
    firstNames: ['Kritsanapong', 'Pongsakorn', 'Thanaphon', 'Watcharapol', 'Nattapong', 'Sirawit', 'Pitchayut', 'Kittiphat', 'Worapon', 'Chanon'],
    lastNames: ['Laosuwan', 'Kaewpila', 'Suwannarat', 'Charoenwong', 'Thamrongsak', 'Boonyasit', 'Phongmak', 'Raksawong', 'Prasert', 'Sirimongkol'],
  },

  // China
  {
    nationality: 'China', region: 'china', weight: 12,
    firstNames: ['Wei', 'Hao', 'Jian', 'Yang', 'Bo', 'Cheng', 'Lei', 'Ming', 'Tao', 'Feng'],
    lastNames: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou'],
  },
];

const ALIAS_PREFIXES = [
  'ace', 'air', 'arc', 'ash', 'axe', 'bay', 'bit', 'blaze', 'bolt',
  'byte', 'crow', 'dark', 'dawn', 'dead', 'doom', 'dusk', 'echo', 'edge',
  'fire', 'flux', 'fog', 'frost', 'fury', 'ghost', 'glitch', 'haze', 'hex',
  'ice', 'ion', 'iris', 'jade', 'kaze', 'kill', 'knife', 'lance', 'lux',
  'mist', 'neon', 'night', 'nova', 'null', 'onyx', 'orb', 'pyre', 'rage',
  'raze', 'red', 'rift', 'riot', 'rush', 'rust', 'sage', 'salt', 'scar',
  'scythe', 'shadow', 'sharp', 'shock', 'shroud', 'silk', 'sin', 'sky',
  'slash', 'slick', 'smoke', 'snap', 'sniper', 'sol', 'solo', 'soot',
  'soul', 'spark', 'spike', 'split', 'squad', 'star', 'steel', 'sting',
  'storm', 'strike', 'surge', 'sync', 'thorn', 'titan', 'toxic', 'track',
  'trap', 'trick', 'trix', 'true', 'ultra', 'uni', 'vex', 'void', 'vox',
  'warp', 'wave', 'wire', 'wolf', 'wrath', 'xero', 'yolo', 'zero', 'zinc',
];

export function generateNationality(rng: Rng): NationalityPool {
  return weightedChoice(
    rng,
    NATIONALITY_POOLS,
    NATIONALITY_POOLS.map(p => p.weight)
  );
}

export function generateNationalityForRegion(rng: Rng, regionId: RegionId): NationalityPool {
  // 85% home-region player, 15% import
  if (rng() < 0.85) {
    const homePools = NATIONALITY_POOLS.filter(p => p.region === regionId);
    if (homePools.length > 0) {
      return weightedChoice(rng, homePools, homePools.map(p => p.weight));
    }
  }
  return generateNationality(rng);
}

export function generateName(pool: NationalityPool, rng: Rng): { firstName: string; lastName: string } {
  return {
    firstName: randChoice(rng, pool.firstNames),
    lastName: randChoice(rng, pool.lastNames),
  };
}

export function generateAlias(firstName: string, nationality: string, rng: Rng): string {
  const r = rng();
  if (r < 0.35) {
    // Based on first name (truncated / stylised)
    return firstName.toLowerCase().slice(0, Math.min(6, firstName.length));
  } else if (r < 0.65) {
    // Prefix + number
    const prefix = randChoice(rng, ALIAS_PREFIXES);
    const num = Math.floor(rng() * 99) + 1;
    return `${prefix}${num}`;
  } else {
    // Two-part composite
    const a = randChoice(rng, ALIAS_PREFIXES);
    const b = randChoice(rng, ALIAS_PREFIXES);
    return `${a}${b}`;
  }
}
