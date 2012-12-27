console.log('executing', __filename);
exports.serviceName = 'nginx';
exports.provides = function(serviceName) {
	return (serviceName == 'web');
};