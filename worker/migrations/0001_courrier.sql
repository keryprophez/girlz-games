-- @version 2026-11-26 16:53
-- LE COURRIER EN LIGNE (26/11) : chaque lettre que Jade et Joyce s'envoient,
-- le texte ici (lisible dans la console D1), les dessins et les voix dans le
-- compartiment R2 girlz-games-courrier. Rien n'est jamais effacé par l'app.
-- Pas de point-virgule dans les commentaires : les tests découpent sur lui.
CREATE TABLE lettres (
  id       TEXT PRIMARY KEY,
  de       TEXT NOT NULL,              -- jade ou joyce
  a        TEXT NOT NULL,
  etat     TEXT NOT NULL,              -- brouillon, cachetee, postee, ouverte, gardee
  cree     INTEGER NOT NULL,           -- ms
  postee   INTEGER NOT NULL DEFAULT 0,
  tour     INTEGER NOT NULL DEFAULT 0,
  papier   TEXT NOT NULL,
  env      TEXT,                       -- JSON couleur, cachet, timbre
  objets   TEXT NOT NULL,              -- JSON des objets, une voix = sa clé R2 (jamais le son)
  peinture TEXT,                       -- clé R2 du dessin, ou NULL
  texte    TEXT NOT NULL DEFAULT '',   -- les textes de la lettre, pour le père
  jetee    INTEGER NOT NULL DEFAULT 0, -- jetée par la destinataire, cachée pour elle, gardée ici
  version  INTEGER NOT NULL,           -- compteur de l'app, plus 1 à chaque écriture
  maj      INTEGER NOT NULL            -- heure du Worker à la dernière écriture (ms), pour le père
);
CREATE TABLE reglages (
  qui   TEXT PRIMARY KEY,
  prefs TEXT NOT NULL,                 -- JSON envois, env, faits
  maj   INTEGER NOT NULL
);
