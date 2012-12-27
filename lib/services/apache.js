console.log('executing', __filename);
exports.serviceName = 'apache';
exports.provides = ['web'];

exports.available = function() {
	return false;
};

exports.init = function() {

};