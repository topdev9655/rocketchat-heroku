/* eslint-env mocha */

import { expect } from 'chai';
import type { Response } from 'supertest';

import { getCredentials, api, request, credentials } from '../../../data/api-data';
import { createAgent, createLivechatRoom, createVisitor, fetchInquiry, makeAgentAvailable } from '../../../data/livechat/rooms';
import { updatePermission, updateSetting } from '../../../data/permissions.helper';

describe('LIVECHAT - inquiries', function () {
	this.retries(0);

	before((done) => getCredentials(done));

	before(async () => {
		await updateSetting('Livechat_enabled', true);
		await updateSetting('Livechat_Routing_Method', 'Manual_Selection');
	});

	describe('livechat/inquiries.list', () => {
		it('should return an "unauthorized error" when the user does not have the necessary permission', async () => {
			await updatePermission('view-livechat-manager', []);
			await request.get(api('livechat/inquiries.list')).set(credentials).expect('Content-Type', 'application/json').expect(403);
		});
		it('should return an array of inquiries', async () => {
			await updatePermission('view-livechat-manager', ['admin']);
			await request
				.get(api('livechat/inquiries.list'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body.inquiries).to.be.an('array');
					expect(res.body).to.have.property('offset');
					expect(res.body).to.have.property('total');
					expect(res.body).to.have.property('count');
				});
		});
	});

	describe('livechat/inquiries.queued', () => {
		it('should return an "unauthorized error" when the user does not have the necessary permission', async () => {
			await updatePermission('view-l-room', []);
			await request.get(api('livechat/inquiries.queued')).set(credentials).expect('Content-Type', 'application/json').expect(403);
		});
		it('should return an array of inquiries', async () => {
			await updatePermission('view-l-room', ['admin']);
			await request
				.get(api('livechat/inquiries.queued'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body.inquiries).to.be.an('array');
					expect(res.body).to.have.property('offset');
					expect(res.body).to.have.property('total');
					expect(res.body).to.have.property('count');
				});
		});
	});

	describe('livechat/inquiries.getOne', () => {
		it('should return an "unauthorized error" when the user does not have the necessary permission', async () => {
			await updatePermission('view-l-room', []);
			await request
				.get(api('livechat/inquiries.getOne?roomId=room-id'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(403);
		});
		it('should return a inquiry', async () => {
			await updatePermission('view-l-room', ['admin']);
			await request
				.get(api('livechat/inquiries.getOne?roomId=room-id'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('inquiry');
				});
		});
	});

	describe('POST livechat/inquiries.take', () => {
		it('should return an "unauthorized error" when the user does not have the necessary permission', async () => {
			await updatePermission('view-l-room', []);
			await request
				.post(api('livechat/inquiries.take'))
				.set(credentials)
				.send({ inquiryId: 'room-id' })
				.expect('Content-Type', 'application/json')
				.expect(403);
		}).timeout(5000);
		it('should throw an error when userId is provided but is invalid', async () => {
			await updatePermission('view-l-room', ['admin', 'livechat-agent']);
			await request
				.post(api('livechat/inquiries.take'))
				.set(credentials)
				.send({ inquiryId: 'room-id', userId: 'invalid-user-id' })
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', false);
				});
		});

		it('should throw an error if inquiryId is not an string', async () => {
			await updatePermission('view-l-room', ['admin', 'livechat-agent']);
			await request
				.post(api('livechat/inquiries.take'))
				.set(credentials)
				.send({ inquiryId: { regexxxx: 'bla' }, userId: 'user-id' })
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', false);
				});
		});

		it('should take an inquiry if all params are good', async () => {
			await updatePermission('view-l-room', ['admin', 'livechat-agent']);
			const agent = await createAgent();
			const visitor = await createVisitor();
			await makeAgentAvailable();
			const room = await createLivechatRoom(visitor.token);
			const inquiry = await fetchInquiry(room._id);

			await request
				.post(api('livechat/inquiries.take'))
				.set(credentials)
				.send({
					inquiryId: inquiry._id,
					userId: agent._id,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', true);
					// TODO has this worked before?
					// expect(res.body).to.have.property('inquiry');
					// expect(res.body.inquiry).to.have.property('servedBy');
					// expect(res.body.inquiry.servedBy).to.have.property('_id', agent._id);
					// expect(res.body.inquiry.source.type).to.equal('api');
				});
		}).timeout(5000);
	});

	describe('livechat/inquiries.queuedForUser', () => {
		it('should return an "unauthorized error" when the user does not have the necessary permission', async () => {
			await updatePermission('view-l-room', []);
			await request.get(api('livechat/inquiries.queued')).set(credentials).expect('Content-Type', 'application/json').expect(403);
		});
		it('should return an array of inquiries', async () => {
			await updatePermission('view-l-room', ['admin']);
			await request
				.get(api('livechat/inquiries.queued'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res: Response) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body.inquiries).to.be.an('array');
					expect(res.body).to.have.property('offset');
					expect(res.body).to.have.property('total');
					expect(res.body).to.have.property('count');
				});
		});
	});
});
