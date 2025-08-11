// Simple test to verify subscription detection integration
// This tests the API endpoints we created

const testUploadWithSubscriptionDetection = async () => {
	console.log('Testing CSV upload with subscription detection...');

	// Create a simple CSV content for testing
	const csvContent = `Date,Description,Amount,Type
2024-01-01,Netflix,99.00,expense
2024-02-01,Netflix,99.00,expense
2024-03-01,Netflix,99.00,expense
2024-01-15,Spotify,79.00,expense
2024-02-15,Spotify,79.00,expense
2024-03-15,Spotify,79.00,expense`;

	// Create a FormData object
	const formData = new FormData();
	const blob = new Blob([csvContent], { type: 'text/csv' });
	const file = new File([blob], 'test-transactions.csv', { type: 'text/csv' });
	formData.append('file', file);

	try {
		// Test the upload endpoint
		const response = await fetch('http://localhost:3000/api/upload', {
			method: 'POST',
			body: formData,
		});

		const result = await response.json();

		if (response.ok) {
			console.log('✅ Upload successful');
			console.log('📊 Summary:', result.data.summary);

			if (result.data.subscriptionDetection) {
				console.log('🔍 Subscription detection results:');
				console.log('  - Candidates:', result.data.subscriptionDetection.candidates.length);
				console.log('  - Matches:', result.data.subscriptionDetection.matches.length);
				console.log('  - Total analyzed:', result.data.subscriptionDetection.totalAnalyzed);

				// Test subscription confirmation if we have candidates
				if (result.data.subscriptionDetection.candidates.length > 0) {
					console.log('🎯 Testing subscription confirmation...');

					const confirmResponse = await fetch(
						'http://localhost:3000/api/subscriptions/confirm',
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								candidates: result.data.subscriptionDetection.candidates
									.slice(0, 1)
									.map((candidate) => ({
										candidate,
										overrides: {
											notes: 'Auto-detected from test upload',
										},
									})),
								matches: result.data.subscriptionDetection.matches,
							}),
						},
					);

					const confirmResult = await confirmResponse.json();

					if (confirmResponse.ok) {
						console.log('✅ Subscription confirmation successful');
						console.log(
							'📝 Created subscriptions:',
							confirmResult.data.subscriptionsCreated,
						);
						console.log(
							'🏷️ Flagged transactions:',
							confirmResult.data.transactionsFlagged,
						);
					} else {
						console.log('❌ Subscription confirmation failed:', confirmResult.message);
					}
				}
			} else {
				console.log(
					'ℹ️ No subscription detection results (this is normal for small datasets)',
				);
			}
		} else {
			console.log('❌ Upload failed:', result.message);
		}
	} catch (error) {
		console.log('❌ Test failed:', error.message);
	}
};

// Test subscription detection endpoint directly
const testSubscriptionDetection = async () => {
	console.log('\nTesting subscription detection endpoint...');

	try {
		const response = await fetch('http://localhost:3000/api/subscriptions/detect', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				// Test with empty body to analyze all transactions
			}),
		});

		const result = await response.json();

		if (response.ok) {
			console.log('✅ Detection endpoint working');
			console.log('📊 Results:', {
				candidates: result.data.candidates.length,
				matches: result.data.matches.length,
				analyzed: result.data.analyzedTransactions,
			});
		} else {
			console.log('❌ Detection failed:', result.message);
		}
	} catch (error) {
		console.log('❌ Detection test failed:', error.message);
	}
};

// Test feedback endpoint
const testFeedback = async () => {
	console.log('\nTesting feedback endpoint...');

	try {
		const response = await fetch('http://localhost:3000/api/subscriptions/feedback', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				patternId: 'test-pattern-id',
				wasCorrect: true,
				feedback: 'Test feedback from integration test',
			}),
		});

		const result = await response.json();

		if (response.ok) {
			console.log('✅ Feedback endpoint working');
		} else {
			console.log('❌ Feedback failed:', result.message);
		}
	} catch (error) {
		console.log('❌ Feedback test failed:', error.message);
	}
};

// Run tests
console.log('🧪 Starting subscription integration tests...');
console.log('⚠️ Make sure the development server is running (npm run dev)');

// Wait a bit for server to be ready, then run tests
setTimeout(async () => {
	await testUploadWithSubscriptionDetection();
	await testSubscriptionDetection();
	await testFeedback();
	console.log('\n✨ Integration tests completed!');
}, 1000);
