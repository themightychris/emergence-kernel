var flatiron = require('flatiron')
	,path = require('path')
	,fs = require('fs')
	,kernel;
	
// configure app
flatiron.app = {
	root: '/emergence'
	,directories: {
		'#SERVICES': '#ROOT/services'
		,'#SITES': '#ROOT/sites'
		,'#COREFS': '#ROOT/core-fs'
	}
};

// get app instance
kernel = flatiron.app;

if(kernel.config.get('env') == 'development') {
	kernel.onAny(function() {
		kernel.log.info('kernel event:'.red+ this.event);
	});
}

// setup directories
//app.root = '/emergence';

/*
kernel.use(flatiron.plugins.directories, {
});
*/

// load config
kernel.config.file({ file: path.join(kernel.root, 'config.json') });

kernel.saveConfig = function(callback) {
	kernel.log.info('writing config to disk...'.yellow);
	kernel.config.save(function(error) {
		if(error) {
			return callback(error);
		}
		
		kernel.log.info('securing config file...'.yellow);
		fs.chmod(kernel.config.stores.file.file, 0600, callback);
	});
};


// load services manager
kernel.services = require('./lib/services');

if(require.main === module) {
	kernel.use(flatiron.plugins.cli, {
	  source: path.join(__dirname, 'lib', 'commands'),
	  usage: 'Empty Flatiron Application, please fill out commands'
	});
	
	kernel.start();
	kernel.log.info('kernel started');
}
else {
	module.exports = function(callback) {
		if(kernel.initialized) {
			callback(kernel);
		}
		else {
			kernel.init(null, function() {
				if(kernel.config.get('env') == 'development') {
					kernel.log.info('kernel initialized in library mode');
				}
			
				// switch literal store to readOnly after environment is configured
				kernel.config.stores.literal.readOnly = true;
				
				callback(kernel);
			});
		}
	};
}