import { describe, expect, it } from 'vitest';
import { homePath, redirectFor } from './roles.js';

describe('homePath', () => {
	it('sends each role to the first page it can use', () => {
		expect(homePath('admin')).toBe('admin');
		expect(homePath('manager')).toBe('manager/classrooms');
		expect(homePath('teacher')).toBe('teacher');
		expect(homePath('student')).toBe('student/classrooms');
	});
});

describe('redirectFor', () => {
	it('sends a visitor who is not signed in to the login page', () => {
		expect(redirectFor('/', null, null)).toBe('login');
		expect(redirectFor('/manager/classrooms', 'manager', null)).toBe('login');
		expect(redirectFor('/student/classrooms/abc', 'student', null)).toBe('login');
	});

	it('lets a visitor who is not signed in reach the login page', () => {
		expect(redirectFor('/login', null, null)).toBeNull();
	});

	it('sends a signed-in person away from the login page and the root', () => {
		expect(redirectFor('/login', null, 'teacher')).toBe('teacher');
		expect(redirectFor('/', null, 'admin')).toBe('admin');
	});

	it('lets a person into the pages of their own role', () => {
		expect(redirectFor('/admin', 'admin', 'admin')).toBeNull();
		expect(redirectFor('/admin/curriculum', 'admin', 'admin')).toBeNull();
		expect(redirectFor('/manager/classrooms', 'manager', 'manager')).toBeNull();
		expect(redirectFor('/teacher', 'teacher', 'teacher')).toBeNull();
		expect(redirectFor('/teacher/classrooms/abc', 'teacher', 'teacher')).toBeNull();
	});

	it('sends a person who opens another role’s page back to their own', () => {
		expect(redirectFor('/admin', 'admin', 'manager')).toBe('manager/classrooms');
		expect(redirectFor('/admin/curriculum', 'admin', 'teacher')).toBe('teacher');
		expect(redirectFor('/manager/classrooms', 'manager', 'teacher')).toBe('teacher');
		expect(redirectFor('/teacher/classrooms/abc', 'teacher', 'student')).toBe('student/classrooms');
	});

	it('goes by the matched route, however the address is spelled', () => {
		expect(redirectFor('/%6Danager/classrooms', 'manager', null)).toBe('login');
		expect(redirectFor('/%6Danager/classrooms', 'manager', 'student')).toBe('student/classrooms');
		expect(redirectFor('/%61dmin', 'admin', 'teacher')).toBe('teacher');
	});

	it('sends a role’s bare root to a home', () => {
		expect(redirectFor('/manager', null, 'manager')).toBe('manager/classrooms');
		expect(redirectFor('/student/', null, 'student')).toBe('student/classrooms');
		expect(redirectFor('/manager', null, null)).toBe('login');
	});

	it('leaves paths outside every role alone', () => {
		expect(redirectFor('/logout', null, 'student')).toBeNull();
		expect(redirectFor('/administrator', null, null)).toBeNull();
	});
});
