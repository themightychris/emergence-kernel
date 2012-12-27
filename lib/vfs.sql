set sql_mode='';
set storage_engine=myisam;

CREATE TABLE IF NOT EXISTS activity (id int(10) unsigned NOT NULL AUTO_INCREMENT,  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,  `event` varchar(255) NOT NULL,  actorId int(10) unsigned DEFAULT NULL,  contextType varchar(255) DEFAULT NULL,  contextId int(10) unsigned DEFAULT NULL,  `data` text,  PRIMARY KEY (id)) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS actors (  id int(10) unsigned NOT NULL AUTO_INCREMENT,  username varchar(255) NOT NULL,  `password` char(40) NOT NULL,  email varchar(255) DEFAULT NULL,  PRIMARY KEY (id)) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS collections (  id int(10) unsigned NOT NULL AUTO_INCREMENT,  lft int(10) unsigned NOT NULL,  rgt int(10) unsigned NOT NULL,  handle varchar(255) NOT NULL,  `status` enum('local','inherited','private','deleted') NOT NULL DEFAULT 'local',  parentId int(10) unsigned DEFAULT NULL,  created timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,  creatorId int(10) unsigned DEFAULT NULL,  PRIMARY KEY (id),  UNIQUE KEY handle (parentId,handle)) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS files (  id int(10) unsigned NOT NULL AUTO_INCREMENT,  remoteId int(10) unsigned DEFAULT NULL,  collectionId int(10) unsigned NOT NULL,  handle varchar(255) NOT NULL,  `status` enum('phantom','normal','private','deleted') NOT NULL DEFAULT 'phantom',  sha1 char(40) DEFAULT NULL,  size int(10) unsigned DEFAULT NULL,  mimeType varchar(255) DEFAULT NULL,  created timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,  creatorId int(10) unsigned DEFAULT NULL,  ancestorId int(10) unsigned DEFAULT NULL,  PRIMARY KEY (id),  KEY collectionId (collectionId,`status`,handle)) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `keys` (  `key` char(40) NOT NULL,  valid timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,  expires timestamp NULL DEFAULT NULL,  actorId int(10) unsigned DEFAULT NULL) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS remotes (  id int(11) NOT NULL AUTO_INCREMENT,  hostname varchar(255) NOT NULL,  `key` char(40) NOT NULL,  `ssl` enum('n','y') NOT NULL DEFAULT 'n',  PRIMARY KEY (id)) ENGINE=MyISAM DEFAULT CHARSET=utf8;
