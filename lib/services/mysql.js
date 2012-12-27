var fs = require('fs')
	,path = require('path')
	,util = require('util')
	,child_process = require('child_process')
	//,forever = require('forever-monitor')
	,flatiron = require('flatiron')
	,getEmergenceKernel = require('../../app')
	,mysql = exports;


mysql.serviceName = 'mysql';
mysql.provides = ['sql'];


mysql.available = function(callback) {
	if(mysql.isAvailable) {
		return callback();
	}
	
	getEmergenceKernel(function(kernel) {
	
		var binaryPath = kernel.config.get('services:mysql:binaryPath');
		
		if(binaryPath) {
			fs.exists(binaryPath, function(binaryExists) {
				if(binaryExists) {
					mysql.binaryPath = binaryPath;
					mysql.isAvailable = true;
					callback();
				}
				else {
					callback(new Error('Configured mysqld binaryPath not found: '+binaryPath));
				}
			});
		}
		else {
			_discoverBinary(kernel, function(error, binaryPath) {
				if(error) {
					callback(error);
				}
				else {
					kernel.config.set('services:mysql:binaryPath', binaryPath);
					mysql.binaryPath = binaryPath;
					mysql.isAvailable = true;
					kernel.saveConfig(callback);
				}
			});
		}
		
	});
};


mysql.ready = function(callback) {
	if(mysql.isReady) {
		return callback();
	}
	
	getEmergenceKernel(function(kernel) {
	
		mysql.available(function(error) {
			if(error) {
				return callback(error);
			}
	
			var serviceConfig = kernel.config.get('services:mysql')
				,rootPath = path.join(kernel.config.get('directories:#SERVICES'), 'mysql');
			
			// build paths
			mysql.directories = flatiron.common.directories.normalize({
				'#ROOT': rootPath
			}, {
				'#ROOT': '#ROOT'
				,'#DATA': '#ROOT/data'
				,'#MYSQLDB': '#ROOT/data/mysql'
			});
			
			mysql.baseDir = path.join(mysql.binaryPath, '../../'); // TODO: something smarter?
			mysql.socketPath = path.join(rootPath, 'mysqld.sock');
			mysql.configPath = path.join(rootPath, 'my.cnf');
			mysql.pidPath = path.join(rootPath, 'mysqld.pid');
			mysql.errorLogPath = path.join(rootPath, 'mysqld.error.log');
			mysql.outputLogPath = path.join(rootPath, 'mysqld.output.log');
			
			fs.exists(mysql.directories['#ROOT'], function(rootExists) {
				if(rootExists && serviceConfig.password) {
					mysql.isReady = true;
					callback();
				}
				else if(rootExists) {
					callback(new Error('mysql root exists already but a password is not configured'));
				}
				else if(serviceConfig.password) {
					callback(new Error('mysql is configured but root directory does not exist'));
				}
				else {
					// if the mysql root doesn't exist, bootstrap the local installation
					_bootstrap(kernel, function(error) {
						if(error) {
							callback(error);
						}
						else {
							mysql.isReady = true;
							callback();
						}
					});
				}
			});
		});
		
	});
};


mysql.start = function(callback) {
	if(mysql.isStarted) {
		return callback();
	}
	
	getEmergenceKernel(function(kernel) {
	
		flatiron.common.async.series({
			ready: mysql.ready
			,checkSocket: function(next) {
				fs.exists(mysql.socketPath, function(exists) {
					next(null, exists);
				});
			}
			,checkPidFile: function(next) {
				fs.exists(mysql.pidPath, function(exists) {
					if(exists) {
						fs.readFile(mysql.pidPath, function(error, data) {
							if(error) {
								return next(error);
							}
							
							next(null, parseInt(data.toString()));
						});
					}
					else {
						next(null, false);
					}
				});
			}
		}, function(error, results) {

			if(error) {
				return callback(error);
			}
			
			if(results.checkSocket) {
				if(!results.checkPidFile) {
					return callback(new Error('mysqld has a socket but no pid file'));
				}
				
				// test if pid is legit by sending SIGHUP
				try {
					if(process.kill(results.checkPidFile, 'SIGHUP')) {
						kernel.log.info('mysql appears to already be running'.green);
						mysql.isStarted = true;
						return callback();
					}
				}
				catch(error) {
					if(error.code == 'ESRCH') {
						return callback(new Error('mysqld has a socked and zombie pid'));
					}
					
					kernel.log.error('Encountered unknown error while testing PID:', error);
					return callback(error);
				}
			}
						
			_configure(function(error) {			
				if(error) {
					return callback(error);
				}
								
				kernel.log.info('starting mysql...'.yellow);
				mysql.process = child_process.spawn(mysql.binaryPath, ['--defaults-file='+mysql.configPath], {
					detached: true
					,cwd: mysql.directories['#ROOT']
					,stdio: ['ignore', fs.openSync(mysql.outputLogPath, 'a'), fs.openSync(mysql.outputLogPath, 'a')]
				});
				
				mysql.process.unref();
				
				mysql.process.on('exit', function(code) {
					fs.unwatchFile(mysql.socketPath);
					kernel.log.error('mysql exited, code=', code);
				});

				// wait for socket to become available
				kernel.log.info('waiting for socket to be ready...'.yellow);
				fs.watchFile(mysql.socketPath, {persistent: true, interval: 500}, function(curr, prev) {
					if(curr.dev) {
						kernel.log.info('mysql socket available'.green);
						fs.unwatchFile(mysql.socketPath);
						mysql.isStarted = true;
						callback();
					}
				});
				
				// TODO: some sort of timeout to detect a mysql that's never going to start?
			});
		});

	});
};

mysql.withMySql

mysql.stop = function(callback) {
	if(!mysql.isStarted) {
		return callback();
	}
	
	//TODO: stop mysql
};

mysql.generateConfig = function(callback) {
	getEmergenceKernel(function(kernel) {
	
		mysql.ready(function(error) {
			if(error) {
				return callback(error);
			}
	
			kernel.log.info('generating mysql config...'.yellow);
			
			var bindHost = kernel.config.get('services:mysql:bindHost')
				,c = [
					'[mysqld]'
					,'character-set-server      = utf8'
					,'user                      = mysql'
					,'socket                    = '+mysql.socketPath
					,'pid-file                  = '+mysql.pidPath
					,'log-error                 = '+mysql.errorLogPath
					,'basedir                   = '+mysql.baseDir
					,'datadir                   = '+mysql.directories['#DATA']
					,'tmpdir                    = /tmp/'
					,'skip-external-locking'
					
					, bindHost ? 'bind-address = '+bindHost : 'skip-networking'
					
					//,'log-bin                 = mysqld-bin'
					//,'server-id               = 1'
					
					
					// TODO: calculate based on available memory?

					// myisam optimization
					,'key_buffer                = 16M'
					,'max_allowed_packet        = 1M'
					,'table_cache               = 64'
					,'sort_buffer_size          = 512K'
					,'net_buffer_length         = 8K'
					,'read_buffer_size          = 256K'
					,'read_rnd_buffer_size      = 512K'
					,'myisam_sort_buffer_size   = 8M'
					
					// innodb optimization
					,'innodb_buffer_pool_size           = 16M'
					,'innodb_additional_mem_pool_size   = 2M'
					,'innodb_data_file_path             = ibdata1:10M:autoextend:max:128M'
					,'innodb_log_file_size              = 5M'
					,'innodb_log_buffer_size            = 8M'
					,'innodb_log_files_in_group         = 2'
					,'innodb_flush_log_at_trx_commit    = 1'
					,'innodb_lock_wait_timeout          = 50'
					,'innodb_file_per_table'
				]
		
			callback(null, c.join('\n'));
		});
		
	});
};

// PRIVATE FUNCTIONS
/**
 * Attempts to discover mysql binary and set services:mysql:binaryPath
 * @param {Function} callback
 * @return {Boolean} success
 */
function _discoverBinary(kernel, callback) {
	var which = require('which');
	
	kernel.log.info('Searching for mysqld...'.yellow);
	
	// try to detect from PATH with which
	which('mysqld', function(error, binaryPath) {
		if(binaryPath) {
			kernel.log.info('discovered mysql via which:'.green, binaryPath)
			callback(null, binaryPath);
		}
		else {
			// search common locations
			flatiron.common.async.detectSeries([
				'/usr/sbin/mysqld'
				,'/usr/local/bin/mysqld'
			], fs.exists, function(binaryPath) {
				if(binaryPath) {
					kernel.log.info('discovered mysql via scan:'.green, binaryPath)
					callback(null, binaryPath);
				}
				else {
					callback(new Error('failed to discover binary'));
				}
			});
		}
	});
}


/**
 * Attempts to bootstrap mysql into given path
 * @param {Function} callback
 * @return {Boolean} success
 */
function _bootstrap(kernel, callback) {
	var bootstrapSqlPath;

	flatiron.common.async.series({
		createUsers: function(next) {
			// TODO: create mysql user and group if it doesn't exist
			next();
		}
		
		,createDirectories: function(next) {
			flatiron.common.directories.create(mysql.directories, next);
		}
		
		,discoverBootstrapSqlPath: function(next) {
			bootstrapSqlPath = path.join(mysql.baseDir, 'share/mysql/mysql_system_tables.sql');
			kernel.log.info('looking for bootstrap sql:'.yellow, bootstrapSqlPath);
			
			fs.exists(bootstrapSqlPath, function(sqlExists) {
				if(sqlExists) {
					next();
				}
				else {
					// TODO: try using find if relative resolve fails
					next(new Error('could not discover mysql_system_tables.sql'));
				}
			});
		}
		
		,bootstrapMysql: function(next) {
			var mysqldCommand = +' '
				,bootstrapPassword = flatiron.common.randomString(16)
				,bootstrapCommand, bootstrapResult;
				
			kernel.log.info('bootstrapping mysql:'.yellow, mysql.binaryPath, mysql.directories['#DATA']);

			bootstrapCommand = util.format(
				'{ '
					+'echo "use mysql;";'
					+'cat %s;'
					+'echo "INSERT INTO user SET Host=\'localhost\', User=\'emergence\', Password = PASSWORD(\'%s\')'
						+', Select_priv=\'Y\', Insert_priv=\'Y\', Update_priv=\'Y\', Delete_priv=\'Y\''
						+', Create_priv=\'Y\', Drop_priv=\'Y\', Alter_priv=\'Y\', Index_priv=\'Y\''
						+', Reload_priv=\'Y\', Shutdown_priv=\'Y\', Process_priv=\'Y\', File_priv=\'Y\', References_priv=\'Y\''
						+', Show_db_priv=\'Y\', Create_user_priv=\'Y\', Grant_priv=\'Y\', Super_priv=\'Y\''
						+', Create_tmp_table_priv=\'Y\', Lock_tables_priv=\'Y\', Create_tablespace_priv=\'Y\''
						+', Repl_slave_priv=\'Y\', Repl_client_priv=\'Y\''
						+', Create_view_priv=\'Y\', Show_view_priv=\'Y\''
						+', Create_routine_priv=\'Y\', Alter_routine_priv=\'Y\', Execute_priv=\'Y\''
						+', Event_priv=\'Y\', Trigger_priv=\'Y\';";'
				+' } | %s --datadir=%s --bootstrap --loose-skip-innodb --loose-skip-ndbcluster --default-storage-engine=myisam 2>&1'
				,bootstrapSqlPath
				,bootstrapPassword
				,mysql.binaryPath
				,mysql.directories['#DATA']
			);
				
			child_process.exec(bootstrapCommand, function(error, stdout, stderr) {
				kernel.log.info('mysqld bootstrap output:\n' + stdout.grey);
				if(error) {
					return next(error);
				}
				
				kernel.config.set('services:mysql:username', 'emergence');
				kernel.config.set('services:mysql:password', bootstrapPassword);
				next();
			});
		}
		
		,verifyBootstrap: function(next) {
			var tablePath = path.join(mysql.directories['#DATA'], 'mysql/user.MYI');
			
			fs.exists(tablePath, function(tableExists) {
				if(tableExists) {
					kernel.log.info('mysql bootstrap complete'.green);
					next();
				}
				else {
					next(new Error('bootstrap verification failed, could not find '+tablePath));
				}
			});
		}
		
		,saveConfig: function(next) {
			kernel.saveConfig(next);
		}
		
		,setOwnership: function(next) {
			kernel.log.info('setting directory ownership...'.yellow);
			child_process.exec('chown -R mysql:mysql '+mysql.directories['#ROOT'], next);
		}
	}, function(error, result) {
		if(error) {
			return callback(error);
		}
		
		callback();
	});
}


function _configure(callback) {
	mysql.generateConfig(function(error, mysqlConfigStr) {
		if(error) {
			return callback(error);
		}
			
		fs.writeFile(mysql.configPath, mysqlConfigStr, callback);
	});
}