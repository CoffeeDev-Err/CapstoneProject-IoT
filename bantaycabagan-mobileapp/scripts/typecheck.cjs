const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const configPath = path.join(projectRoot, 'tsconfig.json')
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)

if (configFile.error) {
	process.stderr.write(ts.formatDiagnostics([configFile.error], formatHost()))
	process.exitCode = 1
	return
}

const parsedConfig = ts.parseJsonConfigFileContent(
	configFile.config,
	ts.sys,
	projectRoot,
	{
		resolvePackageJsonExports: false,
	},
	configPath,
)

const program = ts.createProgram({
	rootNames: parsedConfig.fileNames,
	options: parsedConfig.options,
})
const diagnostics = [
	...parsedConfig.errors,
	...ts.getPreEmitDiagnostics(program),
].filter((diagnostic) => {
	if (!diagnostic.file) return true
	return !/[\\/]node_modules[\\/]/.test(diagnostic.file.fileName)
})

if (diagnostics.length > 0) {
	process.stderr.write(ts.formatDiagnostics(diagnostics, formatHost()))
	process.exitCode = 1
} else {
	process.stdout.write('Mobile type-check passed.\n')
}

function formatHost() {
	return {
		getCanonicalFileName: (fileName) => fileName,
		getCurrentDirectory: () => projectRoot,
		getNewLine: () => ts.sys.newLine,
	}
}
